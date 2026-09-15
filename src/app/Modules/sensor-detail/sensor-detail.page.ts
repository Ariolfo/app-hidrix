import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NavController, ToastController } from '@ionic/angular';
import { from, firstValueFrom, timeout } from 'rxjs';

import {
  HistoryPoint,
  HistoryRange,
  Sensor,
  SensorNavState,
  normalizeMoistureStatus,
} from '../../Shared/Models/sensor';
import { IrrigationCropProfile } from '../../Shared/Models/irrigation';
import { IrrigationCalculatorService } from '../../Shared/Services/irrigation-calculator.service';
import { SensorDataCacheService } from '../../Shared/Services/sensor-data-cache.service';
import { SensorService } from '../../Shared/Services/sensor.service';
import { normalizeHistoryPoints } from './normalize-history';
import {
  BAND_COLORS,
  ChartXZoomRange,
  ChartYScaleMode,
  MoistureSvgChart,
  clampChartXRange,
  fullChartXRange,
  isFullChartXRange,
  resolveChartYRange,
  scaleChartXRange,
  SvgPlotPoint,
  buildMoistureSvgChart,
  nearestPlotPointIndex,
} from './moisture-svg-chart';

/** Factor de zoom X por paso de rueda (menor = acercar en tiempo). */
const WHEEL_ZOOM_IN = 0.75;
const WHEEL_ZOOM_OUT = 1.33;

/** Timeout de carga unificada (alineado bajo el HttpClient Visualiti de 60 s). */
const BUNDLE_TIMEOUT_MS = 45000;

const STATUS_LABELS: Record<string, string> = {
  normal: 'Normal, No regar',
  drain: 'Alerta Drenar - saturación',
  irrigate_deficit: 'Alerta REGAR por déficit',
  no_data: 'Sin datos',
};

const ALERT_LABELS: Record<string, string> = {
  normal: 'Normal, No regar',
  drain: 'Alerta Drenar - saturación',
  irrigate_deficit: 'Alerta REGAR por déficit',
};

/**
 * Detalle de sensor: badge de estado CC + gráfica SVG de histórico.
 * Carga unificada vía GET /sensors/{id}/with-history (un viaje Visualiti).
 */
@Component({
  selector: 'app-sensor-detail',
  templateUrl: './sensor-detail.page.html',
  styleUrls: ['./sensor-detail.page.scss'],
  standalone: false,
})
export class SensorDetailPage implements OnInit, OnDestroy {
  private historyRequest = 0;
  private destroy = false;
  private readonly navSeed: Sensor | null;

  sensorId = '';
  sensor: Sensor | null = null;
  history: HistoryPoint[] = [];
  svgChart: MoistureSvgChart | null = null;
  range: HistoryRange = '7d';
  readonly ranges: { value: HistoryRange; label: string }[] = [
    { value: '7d', label: 'ÚLTIMOS 7 DÍAS' },
    { value: '30d', label: 'ÚLTIMOS 30 DÍAS' },
    { value: '6m', label: 'SEIS MESES' },
  ];
  loading = false;
  chartLoading = false;
  chartError: string | null = null;
  cropProfile: IrrigationCropProfile | null = null;
  /** Escala del eje Y: automática (datos ±5) o fija 0–100. */
  chartYScale: ChartYScaleMode = 'dynamic';
  /** Ventana de zoom horizontal (índices en el histórico completo). */
  private chartXZoom: ChartXZoomRange | null = null;
  private pinchZoomStart: {
    distance: number;
    xRange: ChartXZoomRange;
    centerIndex: number;
  } | null = null;

  /** Punto activo al pasar el dedo/cursor sobre la serie. */
  hoverPoint: SvgPlotPoint | null = null;

  get isChartXZoomed(): boolean {
    return this.chartXZoom !== null;
  }

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly navCtrl: NavController,
    private readonly sensorService: SensorService,
    private readonly sensorCache: SensorDataCacheService,
    private readonly irrigationCalculator: IrrigationCalculatorService,
    private readonly toastCtrl: ToastController,
    private readonly cdr: ChangeDetectorRef
  ) {
    // getCurrentNavigation() solo es fiable en el constructor (A2: seed desde mapa).
    const state = this.router.getCurrentNavigation()?.extras
      ?.state as SensorNavState | undefined;
    this.navSeed = state?.sensor ?? null;
  }

  get headerTitle(): string {
    if (!this.sensorId) {
      return 'Sensor';
    }
    const crop = this.cropLabel;
    return crop ? `Sensor ${this.sensorId} – ${crop}` : `Sensor ${this.sensorId}`;
  }

  get cropLabel(): string | null {
    if (!this.sensor?.name) {
      return this.cropProfile?.name ?? null;
    }
    const parts = this.sensor.name.split(/[–-]/);
    if (parts.length >= 2) {
      const crop = parts[parts.length - 1].trim();
      return crop || null;
    }
    return this.cropProfile?.name ?? null;
  }

  get activeProfile(): IrrigationCropProfile {
    return (
      this.cropProfile ??
      this.irrigationCalculator.resolveProfileFromText(
        this.sensor?.name ?? this.sensorId
      )
    );
  }

  /** Bandas CSS de respaldo (mismas fórmulas) si aún no hay SVG. */
  get cssBands(): { bottom: string; height: string; color: string }[] {
    const p = this.activeProfile;
    const { yMin, yMax } = this.chartYRange;
    const span = Math.max(1, yMax - yMin);
    const toPct = (v: number) => `${((v - yMin) / span) * 100}%`;
    const bandHeight = (from: number, to: number) =>
      toPct(Math.min(yMax, Math.max(yMin, to)) - Math.max(yMin, from));

    return [
      {
        bottom: toPct(Math.max(yMin, yMin)),
        height: bandHeight(yMin, p.irrigationDecision),
        color: BAND_COLORS.red,
      },
      {
        bottom: toPct(Math.max(yMin, p.irrigationDecision)),
        height: bandHeight(p.irrigationDecision, p.maxIrrigationLimit),
        color: BAND_COLORS.greenDark,
      },
      {
        bottom: toPct(Math.max(yMin, p.maxIrrigationLimit)),
        height: bandHeight(p.maxIrrigationLimit, yMax),
        color: BAND_COLORS.orange,
      },
    ];
  }

  /** Rango Y del gráfico según la serie visible o el SVG actual. */
  private get chartYRange(): { yMin: number; yMax: number } {
    if (this.svgChart) {
      return { yMin: this.svgChart.yMin, yMax: this.svgChart.yMax };
    }

    const channel = this.logicalChannel();
    const values = this.history.map((p) =>
      channel === 2 ? p.depth30cm : p.depth10cm
    );
    if (values.length) {
      return resolveChartYRange(values, this.chartYScale);
    }

    const p = this.activeProfile;
    return resolveChartYRange(
      [p.irrigationDecision, p.maxIrrigationLimit, p.fieldCapacity],
      this.chartYScale
    );
  }

  get bandLegendItems(): { label: string; color: string }[] {
    const upper = this.activeProfile.maxIrrigationLimit;
    const lower = this.activeProfile.irrigationDecision;
    return [
      {
        label: `Regar déficit < ${lower.toFixed(1)} %`,
        color: BAND_COLORS.red,
      },
      {
        label: `Normal ${lower.toFixed(1)}–${upper.toFixed(1)} %`,
        color: BAND_COLORS.greenDark,
      },
      {
        label: `Drenar > ${upper.toFixed(1)} %`,
        color: BAND_COLORS.orange,
      },
    ];
  }

  get statusLabel(): string {
    if (!this.sensor) {
      return '';
    }
    if (this.badgeStatus === 'no_data') {
      return '';
    }
    return STATUS_LABELS[this.badgeStatus] ?? this.sensor.status;
  }

  /** Estado visual del badge (sin lecturas → no_data). */
  get badgeStatus(): string {
    if (!this.sensor?.readings?.length || this.sensor.status === 'no_data') {
      return 'no_data';
    }
    return normalizeMoistureStatus(this.sensor.status);
  }

  get alertBannerTitle(): string | null {
    if (!this.sensor || this.badgeStatus === 'no_data') {
      return null;
    }
    const fromApi = this.sensor.alertMessage?.trim();
    if (fromApi) {
      return fromApi.replace(/^ALERTA:\s*/i, '');
    }
    return ALERT_LABELS[this.badgeStatus] ?? STATUS_LABELS[this.badgeStatus] ?? null;
  }

  get moistureDisplay(): string {
    if (this.badgeStatus === 'no_data') {
      return 'Sin datos';
    }
    if (!this.sensor?.readings?.length) {
      return 'Sin datos';
    }
    const channel = this.logicalChannel();
    const reading =
      this.sensor.readings.find((r) =>
        channel === 2 ? r.depthCm === 30 : r.depthCm === 10
      ) ?? this.sensor.readings[0];
    return `${reading.value.toFixed(1)} %`;
  }

  async ngOnInit(): Promise<void> {
    this.sensorId = this.route.snapshot.paramMap.get('id') ?? '';
    this.cropProfile =
      this.irrigationCalculator.resolveProfileFromText(this.sensorId);
    this.applyNavStateSeed();
    await this.loadBundle();
  }

  ngOnDestroy(): void {
    this.destroy = true;
  }

  /**
   * Cambia el rango temporal y recarga el paquete detalle+histórico.
   * @param range Nuevo rango.
   */
  async changeRange(range: HistoryRange): Promise<void> {
    if (this.range === range) {
      return;
    }
    this.range = range;
    this.history = [];
    this.svgChart = null;
    this.hoverPoint = null;
    this.chartYScale = 'dynamic';
    this.clearChartZoom();
    this.cdr.detectChanges();
    await this.loadBundle({ historyOnlyUi: true });
  }

  setChartYScale(mode: ChartYScaleMode): void {
    if (!this.history.length) {
      return;
    }
    this.chartYScale = mode;
    this.clearChartZoom();
    this.hoverPoint = null;
    this.rebuildChart();
    this.cdr.detectChanges();
  }

  onChartWheel(event: WheelEvent): void {
    const chart = this.svgChart;
    const host = event.currentTarget as HTMLElement | null;
    if (!chart || !host) {
      return;
    }

    event.preventDefault();

    const local = this.clientToChartPoint(event.clientX, event.clientY, host, chart);
    if (!local || !this.isInsidePlotX(chart, local.x)) {
      return;
    }

    const centerIndex = this.indexFromPlotX(local.x, chart);
    const zoomOut = event.deltaY > 0;
    const factor = zoomOut ? WHEEL_ZOOM_OUT : WHEEL_ZOOM_IN;
    this.applyXZoom(centerIndex, factor);
  }

  onChartTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2) {
      event.preventDefault();
      this.beginPinchZoom(event);
      return;
    }
    this.onChartTouch(event);
  }

  onChartTouchMove(event: TouchEvent): void {
    if (event.touches.length === 2 && this.pinchZoomStart) {
      event.preventDefault();
      this.updatePinchZoom(event);
      return;
    }
    this.onChartTouch(event);
  }

  onChartTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) {
      this.pinchZoomStart = null;
    }
    if (event.touches.length === 0) {
      this.clearChartHover();
    }
  }

  async goMap(): Promise<void> {
    await this.navCtrl.navigateRoot('/map');
  }

  /**
   * Actualiza el tooltip al mover el pointer/cursor sobre la capa HTML del chart.
   */
  onChartPointer(event: PointerEvent | MouseEvent): void {
    const chart = this.svgChart;
    if (!chart?.points.length) {
      return;
    }

    const host = event.currentTarget as HTMLElement | null;
    if (!host) {
      return;
    }

    if (event.type === 'pointerdown' && 'pointerId' in event) {
      try {
        host.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      event.preventDefault();
    }

    this.updateHoverFromClient(event.clientX, event.clientY, host, chart);
  }

  /**
   * Fallback touch (Chrome F12 modo celular a veces prioriza touch sobre pointer).
   */
  onChartTouch(event: TouchEvent): void {
    const chart = this.svgChart;
    if (!chart?.points.length || !event.touches.length) {
      return;
    }
    const host = event.currentTarget as HTMLElement | null;
    if (!host) {
      return;
    }
    event.preventDefault();
    const t = event.touches[0];
    this.updateHoverFromClient(t.clientX, t.clientY, host, chart);
  }

  clearChartHover(): void {
    if (!this.hoverPoint) {
      return;
    }
    this.hoverPoint = null;
    this.cdr.detectChanges();
  }

  /** Texto del día para el tooltip (ej. «18 ago 2026»). */
  formatHoverDay(iso: string): string {
    return new Date(iso).toLocaleDateString('es', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: this.sensor?.timeZoneId,
    });
  }

  /** Hora del punto en el tooltip (ej. «14:30»). */
  formatHoverTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('es', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: this.sensor?.timeZoneId,
    });
  }

  private updateHoverFromClient(
    clientX: number,
    clientY: number,
    host: HTMLElement,
    chart: MoistureSvgChart
  ): void {
    const local = this.clientToChartPoint(clientX, clientY, host, chart);
    if (!local) {
      return;
    }

    if (local.x < chart.plotLeft - 4 || local.x > chart.plotRight + 4) {
      return;
    }

    const idx = nearestPlotPointIndex(chart.points, local.x);
    if (idx < 0) {
      return;
    }

    const next = chart.points[idx];
    if (
      this.hoverPoint &&
      this.hoverPoint.timestamp === next.timestamp &&
      this.hoverPoint.value === next.value
    ) {
      return;
    }
    this.hoverPoint = next;
    this.cdr.detectChanges();
  }

  /**
   * Convierte coordenadas de pantalla a viewBox del chart.
   * El SVG usa preserveAspectRatio="none" (ocupa todo el stage).
   */
  private clientToChartPoint(
    clientX: number,
    clientY: number,
    host: HTMLElement,
    chart: MoistureSvgChart
  ): { x: number; y: number } | null {
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return {
      x: ((clientX - rect.left) / rect.width) * chart.width,
      y: ((clientY - rect.top) / rect.height) * chart.height,
    };
  }

  /**
   * Pinta el badge de inmediato con datos del mapa o de la caché local (A2/A4).
   */
  private applyNavStateSeed(): void {
    const seeded =
      (this.navSeed && this.navSeed.id === this.sensorId
        ? this.navSeed
        : null) ?? this.sensorCache.getSensor(this.sensorId);

    if (!seeded) {
      return;
    }

    this.sensor = seeded;
    this.cropProfile = this.irrigationCalculator.resolveProfileFromText(
      seeded.name
    );
    this.sensorCache.setSensor(seeded);
  }

  /**
   * Carga unificada (A1 + B5): un GET with-history; usa caché cliente (A4).
   * @param options.historyOnlyUi Si true, no bloquea el badge con loading global.
   */
  private async loadBundle(options?: {
    historyOnlyUi?: boolean;
  }): Promise<void> {
    const requestId = ++this.historyRequest;
    const historyOnly = options?.historyOnlyUi === true;

    if (!historyOnly && !this.sensor) {
      this.loading = true;
    }
    this.chartLoading = true;
    this.chartError = null;
    this.cdr.detectChanges();

    try {
      const bundle = await firstValueFrom(
        from(
          this.sensorService.getWithHistory(this.sensorId, this.range)
        ).pipe(timeout(BUNDLE_TIMEOUT_MS))
      );

      if (this.destroy || requestId !== this.historyRequest) {
        return;
      }

      this.sensor = bundle.sensor;
      this.cropProfile = this.irrigationCalculator.resolveProfileFromText(
        bundle.sensor.name
      );
      this.applyHistory(bundle.history);
      this.cdr.detectChanges();
    } catch (e) {
      if (this.destroy || requestId !== this.historyRequest) {
        return;
      }
      this.history = [];
      this.svgChart = null;
      this.chartError =
        e instanceof Error
          ? e.message
          : 'No se pudo cargar el histórico del sensor';
      if (!this.sensor) {
        await this.toast(
          e instanceof Error ? e.message : 'No se pudo cargar el sensor'
        );
      } else {
        await this.toast(this.chartError);
      }
    } finally {
      if (!this.destroy && requestId === this.historyRequest) {
        this.loading = false;
        this.chartLoading = false;
        this.cdr.detectChanges();
      }
    }
  }

  private applyHistory(raw: HistoryPoint[] | unknown): void {
    this.history = normalizeHistoryPoints(raw);
    this.hoverPoint = null;
    this.clearChartZoom();
    this.rebuildChart();
    if (!this.history.length || !this.svgChart) {
      this.chartError = 'Sin lecturas en este rango';
      this.svgChart = null;
    }
  }

  private rebuildChart(): void {
    if (!this.history.length) {
      this.svgChart = null;
      return;
    }
    this.svgChart = buildMoistureSvgChart(
      this.getVisibleHistory(),
      this.activeProfile,
      this.logicalChannel(),
      this.range,
      this.chartYScale,
      this.sensor?.timeZoneId
    );
    if (!this.svgChart) {
      this.chartError = 'Sin lecturas en este rango';
    }
  }

  private getVisibleHistory(): HistoryPoint[] {
    const n = this.history.length;
    if (!n || !this.chartXZoom) {
      return this.history;
    }
    const { startIndex, endIndex } = clampChartXRange(
      this.chartXZoom.startIndex,
      this.chartXZoom.endIndex,
      n
    );
    return this.history.slice(startIndex, endIndex + 1);
  }

  private getCurrentXRange(): ChartXZoomRange {
    const n = this.history.length;
    if (!n) {
      return { startIndex: 0, endIndex: 0 };
    }
    return this.chartXZoom ?? fullChartXRange(n);
  }

  private clearChartZoom(): void {
    this.chartXZoom = null;
    this.pinchZoomStart = null;
  }

  private applyXZoom(centerIndex: number, factor: number): void {
    const n = this.history.length;
    if (n < 2) {
      return;
    }

    const next = scaleChartXRange(
      this.getCurrentXRange(),
      centerIndex,
      factor,
      n
    );
    this.chartXZoom = isFullChartXRange(next, n) ? null : next;
    this.hoverPoint = null;
    this.rebuildChart();
    this.cdr.detectChanges();
  }

  private beginPinchZoom(event: TouchEvent): void {
    const chart = this.svgChart;
    const host = event.currentTarget as HTMLElement | null;
    if (!chart || !host || event.touches.length < 2) {
      return;
    }

    const [t0, t1] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    if (distance <= 0) {
      return;
    }

    const midX = (t0.clientX + t1.clientX) / 2;
    const local = this.clientToChartPoint(midX, 0, host, chart);
    const centerIndex = local
      ? this.indexFromPlotX(local.x, chart)
      : Math.round(
          (this.getCurrentXRange().startIndex +
            this.getCurrentXRange().endIndex) /
            2
        );

    this.pinchZoomStart = {
      distance,
      xRange: this.getCurrentXRange(),
      centerIndex,
    };
    this.hoverPoint = null;
  }

  private updatePinchZoom(event: TouchEvent): void {
    const start = this.pinchZoomStart;
    const n = this.history.length;
    if (!start || n < 2 || event.touches.length < 2) {
      return;
    }

    const [t0, t1] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
    if (distance <= 0 || start.distance <= 0) {
      return;
    }

    const initialSpan = Math.max(1, start.xRange.endIndex - start.xRange.startIndex);
    const scale = distance / start.distance;
    const newSpan = initialSpan / scale;
    const centerRatio =
      (start.centerIndex - start.xRange.startIndex) / initialSpan;
    const startIndex = Math.round(start.centerIndex - centerRatio * newSpan);
    const endIndex = startIndex + newSpan;
    const next = clampChartXRange(startIndex, endIndex, n);

    this.chartXZoom = isFullChartXRange(next, n) ? null : next;
    this.rebuildChart();
    this.cdr.detectChanges();
  }

  private indexFromPlotX(svgX: number, chart: MoistureSvgChart): number {
    const zoom = this.getCurrentXRange();
    const plotW = chart.plotRight - chart.plotLeft;
    if (plotW <= 0) {
      return zoom.startIndex;
    }
    const ratio = Math.max(
      0,
      Math.min(1, (svgX - chart.plotLeft) / plotW)
    );
    const span = Math.max(1, zoom.endIndex - zoom.startIndex);
    return Math.round(zoom.startIndex + ratio * span);
  }

  private isInsidePlotX(chart: MoistureSvgChart, svgX: number): boolean {
    return svgX >= chart.plotLeft && svgX <= chart.plotRight;
  }

  private logicalChannel(): 1 | 2 {
    const m = /-(\d+)$/.exec(this.sensorId);
    return m && m[1] === '2' ? 2 : 1;
  }

  private async toast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({
      message,
      duration: 3000,
      color: 'warning',
    });
    await t.present();
  }
}
