import { Component, OnInit } from '@angular/core';
import {
  MenuController,
  NavController,
  ToastController,
} from '@ionic/angular';

import {
  IRRIGATION_EVENT_TYPES,
  IrrigationEventNoteRecord,
} from '../../Shared/Models/irrigation-event-note';
import {
  IrrigationCropProfile,
  OTHER_CROP_LABEL,
  OTHER_CROP_VALUE,
} from '../../Shared/Models/irrigation';
import { GeoCity, GeoDepartment } from '../../Shared/Models/geo';
import { AuthService } from '../../Shared/Services/auth.service';
import { GeoService } from '../../Shared/Services/geo.service';
import { IrrigationCalculatorService } from '../../Shared/Services/irrigation-calculator.service';
import { IrrigationEventNoteStoreService } from '../../Shared/Services/irrigation-event-note-store.service';

@Component({
  selector: 'app-irrigation-event-notes',
  templateUrl: './irrigation-event-notes.page.html',
  styleUrls: ['./irrigation-event-notes.page.scss'],
  standalone: false,
})
export class IrrigationEventNotesPage implements OnInit {
  readonly irrigationTypes = IRRIGATION_EVENT_TYPES;
  readonly otherCropValue = OTHER_CROP_VALUE;
  readonly otherCropLabel = OTHER_CROP_LABEL;

  crops: readonly IrrigationCropProfile[] = [];
  selectedCrop = '';
  customCropName = '';
  history: IrrigationEventNoteRecord[] = [];
  historyLoading = false;
  historyEmptyMessage: string | null = null;

  plotName = '';
  eventDate = new Date().toISOString().slice(0, 10);
  startTime = '';
  endTime = '';
  irrigationType = '';
  flowRateLph = '';
  soilType = '';

  countryId: number | null = null;
  departments: GeoDepartment[] = [];
  cities: GeoCity[] = [];
  departmentId: number | null = null;
  cityId: number | null = null;
  geoLoading = true;
  geoError: string | null = null;

  saving = false;

  constructor(
    private readonly calculator: IrrigationCalculatorService,
    private readonly store: IrrigationEventNoteStoreService,
    private readonly auth: AuthService,
    private readonly geo: GeoService,
    private readonly toastCtrl: ToastController,
    private readonly menuCtrl: MenuController,
    private readonly navCtrl: NavController
  ) {}

  async ngOnInit(): Promise<void> {
    this.crops = await this.calculator.loadProfiles();
    if (this.crops.length) {
      this.selectedCrop = this.crops[0].name;
    }
    await this.loadGeoDefaults();
    await this.loadHistory();
  }

  get isOtherCropSelected(): boolean {
    return this.selectedCrop === OTHER_CROP_VALUE;
  }

  get durationLabel(): string {
    const minutes = this.estimateDurationMinutes();
    if (minutes == null) {
      return 'Indique hora inicio y fin';
    }
    if (minutes === 0) {
      return '0 min';
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) {
      return `${mins} min`;
    }
    if (mins === 0) {
      return `${hours} h`;
    }
    return `${hours} h ${mins} min`;
  }

  async openMenu(): Promise<void> {
    await this.menuCtrl.open('main-menu');
  }

  async goHome(): Promise<void> {
    await this.navCtrl.navigateRoot('/map');
  }

  onCropSelect(value: string | null | undefined): void {
    if (!value) {
      return;
    }
    this.selectedCrop = value;
    if (value === OTHER_CROP_VALUE) {
      this.customCropName = '';
    }
  }

  async onDepartmentChange(depoId: number | null): Promise<void> {
    this.departmentId = depoId;
    this.cities = [];
    this.cityId = null;
    if (depoId == null) {
      return;
    }
    try {
      this.cities = await this.geo.getCities(depoId);
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudieron cargar las ciudades',
        'warning'
      );
    }
  }

  onCityChange(cityId: number | null): void {
    this.cityId = cityId;
  }

  async save(): Promise<void> {
    const plot = this.plotName.trim();
    const crop = this.resolvedCropName();
    const start = this.startTime.trim();
    const end = this.endTime.trim();
    const type = this.irrigationType.trim();

    if (!plot) {
      await this.toast('Indique el nombre de parcela o lote.', 'warning');
      return;
    }
    if (!crop) {
      await this.toast('Indique el cultivo.', 'warning');
      return;
    }
    if (!this.eventDate) {
      await this.toast('Indique la fecha del riego.', 'warning');
      return;
    }
    if (!start || !end) {
      await this.toast('Indique hora de inicio y finalización.', 'warning');
      return;
    }
    if (!type) {
      await this.toast('Seleccione el tipo de riego.', 'warning');
      return;
    }
    if (this.departmentId == null || this.cityId == null) {
      await this.toast('Seleccione departamento y ciudad.', 'warning');
      return;
    }

    const duration = this.estimateDurationMinutes();
    if (duration == null) {
      await this.toast('Las horas indicadas no son válidas.', 'warning');
      return;
    }

    let flowRate: number | null = null;
    if (this.flowRateLph.trim()) {
      flowRate = Number(this.flowRateLph.trim().replace(',', '.'));
      if (Number.isNaN(flowRate) || flowRate < 0) {
        await this.toast('El caudal hora debe ser un número válido.', 'warning');
        return;
      }
    }

    this.saving = true;
    try {
      await this.store.save({
        plotName: plot,
        cropName: crop,
        cropId: null,
        eventDate: this.eventDate,
        startTime: start,
        endTime: end,
        irrigationType: type,
        flowRateLph: flowRate,
        soilType: this.soilType.trim() || null,
        cityId: this.cityId,
      });

      await this.toast('Nota de riego guardada.', 'success');
      this.plotName = '';
      this.startTime = '';
      this.endTime = '';
      this.irrigationType = '';
      this.flowRateLph = '';
      this.soilType = '';
      this.eventDate = new Date().toISOString().slice(0, 10);
      await this.loadHistory();
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudo guardar la nota',
        'danger'
      );
    } finally {
      this.saving = false;
    }
  }

  formatDay(isoDate: string): string {
    const [y, m, d] = isoDate.split('-');
    if (!y || !m || !d) {
      return isoDate;
    }
    return `${d}/${m}/${y}`;
  }

  formatDuration(minutes: number): string {
    if (minutes === 0) {
      return '0 min';
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) {
      return `${mins} min`;
    }
    if (mins === 0) {
      return `${hours} h`;
    }
    return `${hours} h ${mins} min`;
  }

  formatPlace(row: IrrigationEventNoteRecord): string {
    if (row.departmentName && row.cityName) {
      return `${row.departmentName} — ${row.cityName}`;
    }
    if (row.cityName) {
      return row.cityName;
    }
    return '—';
  }

  private async loadGeoDefaults(): Promise<void> {
    this.geoLoading = true;
    this.geoError = null;
    try {
      const location = await this.auth.getUserLocation();
      if (!location?.countryId) {
        this.geoError =
          'No encontramos su ubicación. Cierre sesión e ingrese de nuevo, o verifique su perfil.';
        return;
      }

      this.countryId = location.countryId;
      this.departments = await this.geo.getDepartments(location.countryId);

      if (location.departmentId) {
        this.departmentId = location.departmentId;
        this.cities = await this.geo.getCities(location.departmentId);
      }

      if (location.cityId) {
        this.cityId = location.cityId;
      }
    } catch (e) {
      this.geoError =
        e instanceof Error
          ? e.message
          : 'No pudimos cargar departamentos y ciudades.';
    } finally {
      this.geoLoading = false;
    }
  }

  private resolvedCropName(): string {
    if (this.isOtherCropSelected) {
      return this.customCropName.trim();
    }
    return this.selectedCrop.trim();
  }

  private async loadHistory(): Promise<void> {
    this.historyLoading = true;
    this.historyEmptyMessage = null;
    try {
      this.history = await this.store.list();
      if (!this.history.length) {
        this.historyEmptyMessage = 'No hay notas registradas';
      }
    } catch {
      this.history = [];
      this.historyEmptyMessage = 'No hay notas registradas';
    } finally {
      this.historyLoading = false;
    }
  }

  private estimateDurationMinutes(): number | null {
    const start = this.parseTime(this.startTime);
    const end = this.parseTime(this.endTime);
    if (start == null || end == null) {
      return null;
    }
    if (end >= start) {
      return end - start;
    }
    return 24 * 60 - start + end;
  }

  private parseTime(raw: string): number | null {
    const text = raw.trim();
    const match = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (!match) {
      return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }
    return hours * 60 + minutes;
  }

  private async toast(
    message: string,
    color: 'danger' | 'success' | 'warning'
  ): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2500, color });
    await t.present();
  }
}
