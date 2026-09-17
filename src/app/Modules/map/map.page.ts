import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { Geolocation } from '@capacitor/geolocation';
import { MenuController, ToastController } from '@ionic/angular';
import * as L from 'leaflet';

import { environment } from '../../../environments/environment';
import { Sensor, mapPinStatus, isSensorOffline } from '../../Shared/Models/sensor';
import { Station } from '../../Shared/Models/station';
import { CropService } from '../../Shared/Services/crop.service';
import { AuthService } from '../../Shared/Services/auth.service';
import { SensorDataCacheService } from '../../Shared/Services/sensor-data-cache.service';
import { SensorService } from '../../Shared/Services/sensor.service';
import { StationCacheService } from '../../Shared/Services/station-cache.service';
import { StationService } from '../../Shared/Services/station.service';

const STATUS_COLORS: Record<string, string> = {
  normal: '#4CAF50',
  drain: '#FB8C00',
  irrigate_deficit: '#E53935',
  no_data: '#90CAF9',
  offline: '#9E9E9E',
  // Compatibilidad con estados legacy
  excess: '#FB8C00',
  attention_high: '#FB8C00',
  saturation: '#FB8C00',
  irrigate: '#E53935',
  attention_low: '#E53935',
  attention: '#E53935',
  deficit: '#E53935',
};

@Component({
  selector: 'app-map',
  templateUrl: './map.page.html',
  styleUrls: ['./map.page.scss'],
  standalone: false,
})
export class MapPage implements OnInit, AfterViewInit, OnDestroy {
  cropFilters: string[] = [];
  selectedCrop: string | null = null;
  loading = true;
  /** Fase 2: trayendo humedad/estado sin bloquear el mapa. */
  enriching = false;
  error: string | null = null;
  stations: Station[] = [];
  sensors: Sensor[] = [];
  /** Sensores dentro del viewport actual del mapa (lista debajo). */
  inViewSensors: Sensor[] = [];
  centerLat = environment.defaultLat;
  centerLng = environment.defaultLng;
  mapLat = environment.defaultLat;
  mapLng = environment.defaultLng;

  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup | null = null;
  private streetLayer: L.TileLayer | null = null;
  private satelliteLayer: L.TileLayer | null = null;
  private usingSatellite = true;
  private mapReady = false;
  private stationsReady = false;

  constructor(
    private readonly stationService: StationService,
    private readonly stationCache: StationCacheService,
    private readonly sensorService: SensorService,
    private readonly sensorCache: SensorDataCacheService,
    private readonly cropService: CropService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly menuCtrl: MenuController,
    private readonly toastCtrl: ToastController,
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef
  ) {}

  /** Sensores filtrados por cultivo (marcadores). */
  get filteredSensors(): Sensor[] {
    return this.sensors.filter((s) => {
      if (s.latitude == null || s.longitude == null) {
        return false;
      }
      return this.matchesCrop(s);
    });
  }

  /** Lista debajo del mapa: solo sensores en la vista actual. */
  get visibleSensors(): Sensor[] {
    return this.inViewSensors;
  }

  async ngOnInit(): Promise<void> {
    const sessionOk = await this.auth.checkSession();
    if (!sessionOk) {
      await this.router.navigateByUrl('/login');
      return;
    }

    try {
      const crops = await this.cropService.list();
      this.cropFilters = crops.map((c) => c.name);
    } catch {
      this.cropFilters = ['Aguacate', 'Cacao', 'Lima', 'Papaya'];
    }
    await this.resolveLocation();
    await this.loadStations();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initMap(), 50);
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = null;
  }

  /**
   * Abre el menú lateral.
   */
  async openMenu(): Promise<void> {
    await this.menuCtrl.open('main-menu');
  }

  /**
   * Muestra todos los cultivos (sin filtro).
   */
  selectAllCrops(): void {
    this.selectedCrop = null;
    this.applyCropFilter();
  }

  /**
   * Filtra el mapa por el cultivo elegido en el selector.
   */
  onCropSelect(crop: string): void {
    this.selectedCrop = crop;
    this.applyCropFilter();
  }

  private applyCropFilter(): void {
    this.refreshMapView();
    setTimeout(() => this.map?.invalidateSize(), 50);
  }

  /**
   * Recarga estaciones desde la API (fuerza red; mantiene pines si hay caché).
   */
  async refresh(): Promise<void> {
    await this.loadStations({ forceNetwork: true });
  }

  /**
   * Prefetch del histórico en background y navega al detalle con snapshot del sensor.
   * @param sensor Sensor seleccionado en el mapa.
   */
  openSensor(sensor: Sensor): void {
    this.sensorCache.setSensor(sensor);
    // Dispara with-history mientras navega (caché lista al pintar la gráfica).
    this.sensorService.prefetchWithHistory(sensor.id, '7d');
    void this.router.navigate(['/sensor', sensor.id], {
      state: { sensor },
    });
  }

  isOffline(sensor: Sensor): boolean {
    return isSensorOffline(sensor);
  }

  private async resolveLocation(): Promise<void> {
    try {
      const perm = await Geolocation.checkPermissions();
      if (perm.location === 'denied') {
        return;
      }
      const pos = await Geolocation.getCurrentPosition({
        timeout: 8000,
        enableHighAccuracy: false,
      });
      this.centerLat = pos.coords.latitude;
      this.centerLng = pos.coords.longitude;
      this.mapLat = this.centerLat;
      this.mapLng = this.centerLng;
    } catch {
      // Fallback al centro por defecto (Valle / Roldanillo).
    }
  }

  /**
   * Pinta caché local al instante y refresca en background (2 fases).
   * @param options.forceNetwork Si true (botón actualizar), siempre consulta red.
   */
  private async loadStations(options?: {
    forceNetwork?: boolean;
  }): Promise<void> {
    const forceNetwork = options?.forceNetwork === true;
    this.error = null;

    const cached = await this.stationCache.read();
    const hasCache = !!cached?.stations?.length;
    if (hasCache) {
      this.stations = cached!.stations;
      this.applyStationsToView();
      this.loading = false;
      this.enriching = true;
      this.cdr.detectChanges();
      setTimeout(() => this.map?.invalidateSize(), 100);
    } else {
      this.loading = true;
      this.enriching = false;
      this.cdr.detectChanges();
    }

    // Con caché fresca (<1 día) y sin force: igual se refresca humedad en background.
    // Con caché stale o sin caché: se hace el ciclo completo de red.
    try {
      await this.refreshStationsFromNetwork({
        preferSkeletonFirst:
          forceNetwork ||
          !hasCache ||
          this.stationCache.isInventoryStale(cached),
      });
    } catch (e) {
      if (hasCache) {
        // Mantener mapa usable con datos locales.
        this.enriching = false;
        this.loading = false;
        this.cdr.detectChanges();
        const toast = await this.toastCtrl.create({
          message: 'Sin red: mostrando estaciones guardadas en el dispositivo.',
          duration: 2800,
          color: 'medium',
        });
        await toast.present();
        return;
      }
      this.error =
        e instanceof Error ? e.message : 'No se pudieron cargar estaciones';
      if (this.isAuthError(e)) {
        await this.auth.logout();
        await this.router.navigateByUrl('/login');
        return;
      }
      const toast = await this.toastCtrl.create({
        message: this.error,
        duration: 3500,
        color: 'warning',
      });
      await toast.present();
    } finally {
      this.loading = false;
      this.enriching = false;
      this.cdr.detectChanges();
      setTimeout(() => this.map?.invalidateSize(), 100);
    }
  }

  /**
   * Trae estaciones de la API en 1–2 fases y persiste el resultado enriquecido.
   */
  private async refreshStationsFromNetwork(opts: {
    preferSkeletonFirst: boolean;
  }): Promise<void> {
    this.enriching = true;
    this.cdr.detectChanges();

    if (opts.preferSkeletonFirst) {
      let skeleton = await this.fetchStations(
        this.centerLat,
        this.centerLng,
        environment.defaultRadiusKm,
        true,
        false
      );
      if (skeleton.length === 0) {
        skeleton = await this.fetchStations(
          environment.defaultLat,
          environment.defaultLng,
          environment.fallbackRadiusKm,
          true,
          false
        );
      }
      if (skeleton.length > 0) {
        this.stations = skeleton;
        this.applyStationsToView();
        this.loading = false;
        this.cdr.detectChanges();
        setTimeout(() => this.map?.invalidateSize(), 100);
      }
    }

    const enriched = await this.fetchStations(
      this.centerLat,
      this.centerLng,
      environment.defaultRadiusKm,
      true,
      true
    );
    const finalStations =
      enriched.length > 0
        ? enriched
        : await this.fetchStations(
            environment.defaultLat,
            environment.defaultLng,
            environment.fallbackRadiusKm,
            true,
            true
          );

    if (finalStations.length > 0) {
      this.stations = finalStations;
      this.applyStationsToView();
      await this.stationCache.write(finalStations);
    } else if (!this.stations.length) {
      throw new Error('No se pudieron cargar estaciones');
    }
  }

  /** Aplica estaciones al estado de UI y repinta marcadores. */
  private applyStationsToView(): void {
    this.sensors = this.flattenSensors(this.stations);
    for (const sensor of this.sensors) {
      this.sensorCache.setSensor(sensor);
    }
    this.stationsReady = true;
    this.refreshMapView();
  }

  private async fetchStations(
    lat: number,
    lng: number,
    radiusKm: number,
    all = false,
    includeSensors = true
  ): Promise<Station[]> {
    return this.stationService.getNearby(
      lat,
      lng,
      radiusKm,
      includeSensors,
      all
    );
  }

  private flattenSensors(stations: Station[]): Sensor[] {
    const list: Sensor[] = [];
    for (const st of stations) {
      for (const sensor of st.sensors ?? []) {
        list.push({
          ...sensor,
          latitude: sensor.latitude ?? st.latitude,
          longitude: sensor.longitude ?? st.longitude,
          stationId: sensor.stationId || st.id,
        });
      }
    }
    return list;
  }

  private initMap(): void {
    if (this.map) {
      this.map.invalidateSize();
      this.refreshMapView();
      return;
    }

    // Fix default icon paths broken by bundlers.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
      iconUrl: 'assets/leaflet/marker-icon.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
    });

    this.map = L.map('hidrix-map', {
      center: [this.mapLat, this.mapLng],
      zoom: 11,
      zoomControl: true,
    });

    this.satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19,
      }
    );
    this.streetLayer = L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }
    );

    // Satélite por defecto.
    this.satelliteLayer.addTo(this.map);
    this.usingSatellite = true;
    this.addLayerToggleControl();

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.map.on('moveend zoomend', () => {
      this.zone.run(() => this.syncInViewList());
    });
    this.mapReady = true;
    this.refreshMapView();
    setTimeout(() => this.map?.invalidateSize(), 200);
  }

  /** Pinta marcadores, encuadra datos y sincroniza la lista cuando mapa y API están listos. */
  private refreshMapView(): void {
    if (!this.stationsReady) {
      this.inViewSensors = this.mapMarkerSensors();
      this.cdr.markForCheck();
      return;
    }
    if (!this.mapReady || !this.map) {
      this.inViewSensors = this.mapMarkerSensors();
      this.cdr.markForCheck();
      return;
    }
    this.renderMarkers();
    this.fitBounds();
    this.syncInViewList();
  }

  /**
   * Alterna entre capa satélite y calles.
   */
  private toggleMapLayer(): void {
    if (!this.map || !this.streetLayer || !this.satelliteLayer) {
      return;
    }
    if (this.usingSatellite) {
      this.map.removeLayer(this.satelliteLayer);
      this.streetLayer.addTo(this.map);
      this.usingSatellite = false;
    } else {
      this.map.removeLayer(this.streetLayer);
      this.satelliteLayer.addTo(this.map);
      this.usingSatellite = true;
    }
  }

  /**
   * Control Leaflet: botón de capa debajo del zoom (+/-) en topleft.
   */
  private addLayerToggleControl(): void {
    if (!this.map) {
      return;
    }
    const self = this;
    const LayerToggle = L.Control.extend({
      onAdd() {
        const container = L.DomUtil.create(
          'div',
          'leaflet-bar hidrix-layer-control'
        );
        const btn = L.DomUtil.create(
          'button',
          'hidrix-layer-btn',
          container
        ) as HTMLButtonElement;
        btn.type = 'button';
        btn.title = 'Cambiar capa del mapa';
        btn.setAttribute('aria-label', 'Cambiar capa del mapa');
        btn.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M12 2L2 7l10 5 10-5-10-5zm0 9L2 6v2l10 5 10-5V6l-10 5zm0 4L2 10v2l10 5 10-5v-2l-10 5z"/>' +
          '</svg>';
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);
        L.DomEvent.on(btn, 'click', (e: Event) => {
          L.DomEvent.stop(e);
          self.toggleMapLayer();
        });
        return container;
      },
    });
    new LayerToggle({ position: 'topleft' }).addTo(this.map);
  }

  private matchesCrop(sensor: Sensor): boolean {
    if (!this.selectedCrop) {
      return true;
    }
    return this.cropGroup(sensor) === this.selectedCrop;
  }

  private cropGroup(sensor: Sensor): string | null {
    const raw = `${sensor.name} ${sensor.location}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    if (raw.includes('aguacate')) {
      return 'Aguacate';
    }
    if (raw.includes('cacao')) {
      return 'Cacao';
    }
    if (raw.includes('lima') || raw.includes('tahiti')) {
      return 'Lima';
    }
    if (raw.includes('papaya')) {
      return 'Papaya';
    }
    return null;
  }

  private markerIcon(sensorId: string, color: string, labelBelow: boolean): L.DivIcon {
    const label = this.escapeHtml(sensorId);
    const labelClass = labelBelow
      ? 'hidrix-marker-label hidrix-marker-label--below'
      : 'hidrix-marker-label hidrix-marker-label--above';
    return L.divIcon({
      className: 'hidrix-marker',
      html:
        `<div class="hidrix-marker-wrap">` +
        `<span class="${labelClass}" style="border-color:${color};color:#000000">${label}</span>` +
        `<span class="hidrix-marker-dot" style="background:${color}"></span>` +
        `</div>`,
      iconSize: [80, 58],
      iconAnchor: [40, labelBelow ? 20 : 38],
    });
  }

  private channelFromId(sensorId: string): number {
    const match = sensorId.match(/-(\d+)$/);
    return match ? Number.parseInt(match[1], 10) : 1;
  }

  private markerPosition(sensor: Sensor): [number, number] {
    const lat = sensor.latitude as number;
    const lng = sensor.longitude as number;
    const channel = this.channelFromId(sensor.id);
    const offset = channel === 1 ? 0.00085 : -0.00085;
    return [lat + offset, lng];
  }

  private renderMarkers(): void {
    if (!this.map || !this.markersLayer) {
      return;
    }
    this.markersLayer.clearLayers();

    const visible = this.filteredSensors;
    for (const sensor of visible) {
      const [lat, lng] = this.markerPosition(sensor);
      const pinStatus = mapPinStatus(sensor);
      const color = STATUS_COLORS[pinStatus] ?? STATUS_COLORS['no_data'];
      const labelBelow = this.channelFromId(sensor.id) === 2;
      const marker = L.marker([lat, lng], {
        icon: this.markerIcon(sensor.id, color, labelBelow),
      });
      const conn = (sensor.connectivity || (sensor.online === false ? 'offline' : '—')).toString();
      const hw = sensor.hardwareStatus || '—';
      marker.bindPopup(
        `<strong>${this.escapeHtml(sensor.name)}</strong><br/>` +
          `${this.escapeHtml(sensor.id)} · humedad: ${this.escapeHtml(sensor.status)}<br/>` +
          `estación: ${this.escapeHtml(conn)} · hardware: ${this.escapeHtml(hw)}`
      );
      marker.on('click', () => {
        this.openSensor(sensor);
      });
      marker.addTo(this.markersLayer);
    }

    // Si no hay sensores anidados, marcar estaciones.
    if (visible.length === 0) {
      for (const st of this.stations) {
        if (!this.stationMatchesCropFilter(st)) {
          continue;
        }
        const offline =
          st.online === false ||
          (st.connectivity || '').toLowerCase() === 'offline';
        const color = offline ? STATUS_COLORS['offline'] : '#309020';
        const marker = L.marker([st.latitude, st.longitude], {
          icon: this.markerIcon(st.id, color, false),
        });
        marker.bindPopup(
          `<strong>${this.escapeHtml(st.name)}</strong><br/>` +
            `${st.sensorCount} sensores · ${this.escapeHtml(st.connectivity || '—')}`
        );
        const firstSensor = st.sensors?.[0];
        marker.on('click', () => {
          if (firstSensor) {
            void this.router.navigate(['/sensor', firstSensor.id]);
          }
        });
        marker.addTo(this.markersLayer!);
      }
    }
  }

  /**
   * Sensores que corresponden a los marcadores del mapa (incluye fallback por estación).
   */
  private mapMarkerSensors(): Sensor[] {
    const visible = this.filteredSensors;
    if (visible.length > 0) {
      return visible;
    }

    const list: Sensor[] = [];
    for (const st of this.stations) {
      if (!this.stationMatchesCropFilter(st)) {
        continue;
      }
      for (const sensor of st.sensors ?? []) {
        list.push({
          ...sensor,
          latitude: sensor.latitude ?? st.latitude,
          longitude: sensor.longitude ?? st.longitude,
          stationId: sensor.stationId || st.id,
        });
      }
    }
    return list.filter(
      (sensor) =>
        sensor.latitude != null &&
        sensor.longitude != null &&
        this.matchesCrop(sensor)
    );
  }

  private stationMatchesCropFilter(st: Station): boolean {
    if (!this.selectedCrop) {
      return true;
    }
    const hasCrop = (st.sensors ?? []).some((s) => this.matchesCrop(s));
    if ((st.sensors?.length ?? 0) > 0 && !hasCrop) {
      return false;
    }
    if ((st.sensors?.length ?? 0) === 0) {
      const nameMatch = this.cropGroup({
        id: st.id,
        stationId: st.id,
        name: st.name,
        location: st.name,
        status: 'normal',
        lastReadingAt: '',
        readings: [],
      });
      return nameMatch === this.selectedCrop;
    }
    return true;
  }

  /**
   * Actualiza la lista inferior según los límites visibles del mapa.
   */
  private syncInViewList(): void {
    const markerSensors = this.mapMarkerSensors();
    if (!this.map) {
      this.inViewSensors = markerSensors;
      this.cdr.markForCheck();
      return;
    }
    const bounds = this.map.getBounds();
    this.inViewSensors = markerSensors.filter((sensor) => {
      const [lat, lng] = this.markerPosition(sensor);
      return bounds.contains(L.latLng(lat, lng));
    });
    this.cdr.markForCheck();
  }

  private fitBounds(): void {
    if (!this.map) {
      return;
    }
    const pts: L.LatLngExpression[] = this.mapMarkerSensors().map((s) => {
      const [lat, lng] = this.markerPosition(s);
      return [lat, lng] as L.LatLngExpression;
    });
    if (pts.length === 0) {
      pts.push(
        ...this.stations.map(
          (s) => [s.latitude, s.longitude] as L.LatLngExpression
        )
      );
    }
    if (pts.length > 0) {
      this.map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 13 });
    } else {
      this.map.setView([this.mapLat, this.mapLng], 11);
    }
  }

  private isAuthError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const msg = error.message.toLowerCase();
    return msg.includes('sesión expirada') || msg.includes('401');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
