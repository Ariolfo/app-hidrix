import { Component, OnInit } from '@angular/core';
import {
  MenuController,
  NavController,
  ToastController,
} from '@ionic/angular';

import { CatalogSensorService } from '../../Shared/Services/catalog-sensor.service';
import { CropService } from '../../Shared/Services/crop.service';
import { SensorService } from '../../Shared/Services/sensor.service';
import {
  buildDryingLimbChart,
  buildSeriesCycleChart,
  FcChartModel,
} from './fc-charts';
import {
  CropSensorGroup,
  FcEstimationResult,
  FcMethodKey,
} from './fc-estimate.models';
import { runFcEstimation } from './fc-estimator';
import { METODOS_CC_AUTOMATIZADOS, findMetodoByKey } from './metodos-cc.data';
import {
  defaultStudyRange,
  groupSensorsByCrop,
  moistureChannelFromSensorId,
} from './metodos-cc-sensors.util';

@Component({
  selector: 'app-metodo-cc-estimate',
  templateUrl: './metodo-cc-estimate.page.html',
  styleUrls: ['./metodo-cc-estimate.page.scss'],
  standalone: false,
})
export class MetodoCCEstimatePage implements OnInit {
  readonly methods = METODOS_CC_AUTOMATIZADOS;

  loadingSensors = true;
  estimating = false;
  estimatingMethod: FcMethodKey | null = null;
  sensorError: string | null = null;

  cropGroups: CropSensorGroup[] = [];
  private cropFieldCapacityByName = new Map<string, number>();
  selectedCrop = '';
  selectedSensorId = '';
  studyStart = '';
  studyEnd = '';

  activeMethodKey: FcMethodKey | null = null;
  activeMethodName = '';

  result: FcEstimationResult | null = null;
  seriesChart: FcChartModel | null = null;
  dryingChart: FcChartModel | null = null;

  constructor(
    private readonly catalog: CatalogSensorService,
    private readonly crops: CropService,
    private readonly sensors: SensorService,
    private readonly menuCtrl: MenuController,
    private readonly navCtrl: NavController,
    private readonly toastController: ToastController
  ) {}

  ngOnInit(): void {
    const range = defaultStudyRange();
    this.studyStart = range.start;
    this.studyEnd = range.end;
    void this.loadSensors();
  }

  get filteredSensors() {
    const group = this.cropGroups.find((g) => g.cropName === this.selectedCrop);
    return group?.sensors ?? [];
  }

  get selectedSensorLabel(): string {
    return (
      this.filteredSensors.find((s) => s.sensorId === this.selectedSensorId)
        ?.label ?? ''
    );
  }

  /** CC de referencia del cultivo (HidrtbCultivo.Cult_CapacidadCampo). */
  get cropConstantCc(): number | null {
    const value = this.cropFieldCapacityByName.get(this.selectedCrop.trim());
    return value != null && !Number.isNaN(value) ? value : null;
  }

  async openMenu(): Promise<void> {
    await this.menuCtrl.open('main-menu');
  }

  async goHome(): Promise<void> {
    await this.navCtrl.navigateRoot('/map');
  }

  onCropChange(crop: string | null | undefined): void {
    if (!crop) {
      return;
    }
    this.selectedCrop = crop;
    const first = this.filteredSensors[0];
    this.selectedSensorId = first?.sensorId ?? '';
    this.clearResults();
  }

  onSensorChange(sensorId: string | null | undefined): void {
    if (!sensorId) {
      return;
    }
    this.selectedSensorId = sensorId;
    this.clearResults();
  }

  async estimate(methodKey: FcMethodKey): Promise<void> {
    const metodo = findMetodoByKey(methodKey);
    if (!metodo) {
      return;
    }

    if (!this.selectedSensorId) {
      await this.showToast('Seleccione un sensor.', 'warning');
      return;
    }
    if (!this.studyStart || !this.studyEnd) {
      await this.showToast('Indique las fechas del estudio.', 'warning');
      return;
    }
    if (this.studyStart > this.studyEnd) {
      await this.showToast(
        'La fecha inicial debe ser anterior a la final.',
        'warning'
      );
      return;
    }

    this.estimating = true;
    this.estimatingMethod = methodKey;
    this.activeMethodKey = methodKey;
    this.activeMethodName = metodo.name;
    this.clearResults();

    try {
      const channel = moistureChannelFromSensorId(this.selectedSensorId);
      const bundle = await this.sensors.getWithHistory(this.selectedSensorId, '6m');
      const result = runFcEstimation({
        method: methodKey,
        methodLabel: metodo.name,
        sensorLabel: this.selectedSensorLabel || this.selectedSensorId,
        channel,
        studyStart: this.studyStart,
        studyEnd: this.studyEnd,
        history: bundle.history,
      });

      this.result = result;
      this.seriesChart = buildSeriesCycleChart(result);
      this.dryingChart = buildDryingLimbChart(result);

      await this.persistEstimatedFc(result, metodo.name);

      if (!result.seriesFound) {
        await this.showToast(
          'No se detectaron ciclos SWDP en el periodo seleccionado.',
          'warning'
        );
      } else if (!result.completeSeries) {
        await this.showToast(
          'Se detectaron ciclos, pero ninguno cumple los criterios completos.',
          'warning'
        );
      }
    } catch (e) {
      await this.showToast(
        e instanceof Error ? e.message : 'No se pudo estimar la CC',
        'danger'
      );
    } finally {
      this.estimating = false;
      this.estimatingMethod = null;
    }
  }

  isEstimating(methodKey: FcMethodKey): boolean {
    return this.estimating && this.estimatingMethod === methodKey;
  }

  formatDateTime(iso: string): string {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }

  formatNum(v: number | null | undefined): string {
    if (v == null || Number.isNaN(v)) {
      return '—';
    }
    return String(v);
  }

  private async loadSensors(): Promise<void> {
    this.loadingSensors = true;
    this.sensorError = null;
    try {
      const [list, cropList] = await Promise.all([
        this.catalog.listSensors(),
        this.crops.list(),
      ]);
      this.cropFieldCapacityByName = new Map(
        cropList.map((c) => [c.name.trim(), c.fieldCapacity])
      );
      this.cropGroups = groupSensorsByCrop(list);
      if (this.cropGroups.length) {
        this.selectedCrop = this.cropGroups[0].cropName;
        this.selectedSensorId = this.cropGroups[0].sensors[0]?.sensorId ?? '';
      }
    } catch (e) {
      this.sensorError =
        e instanceof Error ? e.message : 'No se pudo cargar sensores';
    } finally {
      this.loadingSensors = false;
    }
  }

  private clearResults(): void {
    this.result = null;
    this.seriesChart = null;
    this.dryingChart = null;
  }

  private async persistEstimatedFc(
    result: FcEstimationResult,
    methodName: string
  ): Promise<void> {
    const fc =
      result.bestEstimatedFcPercent ??
      result.averageCc ??
      result.lastEstimatedCc;
    if (fc == null || Number.isNaN(fc)) {
      return;
    }

    const catalogId = this.filteredSensors.find(
      (s) => s.sensorId === this.selectedSensorId
    )?.catalogId;
    if (!catalogId) {
      return;
    }

    try {
      await this.catalog.saveEstimatedFieldCapacity(catalogId, {
        fieldCapacity: fc,
        method: methodName,
        estimatedAt: new Date().toISOString(),
      });
      await this.showToast(
        `CC estimada ${fc.toFixed(1)} % guardada en el sensor.`,
        'success'
      );
    } catch (e) {
      await this.showToast(
        e instanceof Error
          ? e.message
          : 'La CC se estimó pero no se pudo guardar en el sensor',
        'warning'
      );
    }
  }

  private async showToast(
    message: string,
    toastColor: 'danger' | 'success' | 'warning'
  ): Promise<void> {
    const alert = await this.toastController.create({
      message,
      duration: 3000,
      color: toastColor,
    });
    await alert.present();
  }
}
