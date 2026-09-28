import { Component, OnInit } from '@angular/core';
import {
  AlertController,
  MenuController,
  NavController,
  ToastController,
} from '@ionic/angular';

import { IrrigationCalculationRecord } from '../../Shared/Models/irrigation-calculation';
import {
  IrrigationCropProfile,
  OTHER_CROP_LABEL,
  OTHER_CROP_VALUE,
} from '../../Shared/Models/irrigation';
import { IrrigationCalculationStoreService } from '../../Shared/Services/irrigation-calculation-store.service';
import { IrrigationCalculatorService } from '../../Shared/Services/irrigation-calculator.service';

@Component({
  selector: 'app-irrigation-calculator',
  templateUrl: './irrigation-calculator.page.html',
  styleUrls: ['./irrigation-calculator.page.scss'],
  standalone: false,
})
export class IrrigationCalculatorPage implements OnInit {
  readonly otherCropValue = OTHER_CROP_VALUE;
  readonly otherCropLabel = OTHER_CROP_LABEL;

  crops: readonly IrrigationCropProfile[] = [];
  selectedCrop = '';
  customCropName = '';
  history: IrrigationCalculationRecord[] = [];
  historyLoading = false;
  historyEmptyMessage: string | null = null;

  fieldCapacity = '';
  maxIrrigationLimit = '';
  irrigationDecision = '';
  morningMoisture = '';
  afternoonMoisture = '';
  observation = '';
  irrigationAction: string | null = null;
  consultationDate = new Date().toISOString().slice(0, 10);
  saving = false;

  constructor(
    private readonly calculator: IrrigationCalculatorService,
    private readonly store: IrrigationCalculationStoreService,
    private readonly alertCtrl: AlertController,
    private readonly toastCtrl: ToastController,
    private readonly menuCtrl: MenuController,
    private readonly navCtrl: NavController
  ) {}

  async ngOnInit(): Promise<void> {
    this.crops = await this.calculator.loadProfiles();
    if (this.crops.length) {
      await this.onCropSelect(this.crops[0].name);
    }
  }

  get isOtherCropSelected(): boolean {
    return this.selectedCrop === OTHER_CROP_VALUE;
  }

  get displayCropName(): string {
    return this.resolvedCropName();
  }

  async openMenu(): Promise<void> {
    await this.menuCtrl.open('main-menu');
  }

  async goHome(): Promise<void> {
    await this.navCtrl.navigateRoot('/map');
  }

  /** Selección desde la lista desplegable. */
  async onCropSelect(value: string | null | undefined): Promise<void> {
    if (!value) {
      return;
    }

    this.selectedCrop = value;
    if (value === OTHER_CROP_VALUE) {
      this.customCropName = '';
      this.fieldCapacity = '';
      this.maxIrrigationLimit = '';
      this.irrigationDecision = '';
      this.morningMoisture = '';
      this.afternoonMoisture = '';
      this.observation = '';
      this.irrigationAction = null;
      this.consultationDate = new Date().toISOString().slice(0, 10);
      this.history = [];
      this.historyEmptyMessage = null;
      return;
    }

    this.customCropName = '';
    await this.applyCropName(value, true);
  }

  /** Al salir del campo de otro cultivo, carga historial si aplica. */
  async onCustomCropBlur(): Promise<void> {
    const name = this.customCropName.trim();
    if (!this.isOtherCropSelected || !name) {
      this.history = [];
      this.historyEmptyMessage = null;
      return;
    }
    await this.loadHistory(name);
  }

  /**
   * Si el usuario cambia CC, estima límite máx. (0,8 CC) y decisión (0,64 CC).
   */
  onFieldCapacityChange(raw: string | number | null | undefined): void {
    const text = raw == null ? '' : String(raw);
    this.fieldCapacity = text;
    const cc = this.parsePercent(text);
    if (cc == null) {
      return;
    }
    this.maxIrrigationLimit = this.formatNumber(cc * 0.8);
    this.irrigationDecision = this.formatNumber(cc * 0.64);
  }

  get recommendation(): string | null {
    const morning = this.parsePercent(this.morningMoisture);
    const afternoon = this.parsePercent(this.afternoonMoisture);
    const decision = this.parsePercent(this.irrigationDecision);
    if (morning == null || afternoon == null || decision == null) {
      return null;
    }
    return this.calculator.recommendation(morning, afternoon, decision);
  }

  get resultClass(): string {
    if (this.recommendation === 'No regar') {
      return 'result-ok';
    }
    if (this.recommendation === 'Regar') {
      return 'result-irrigate';
    }
    return 'result-neutral';
  }

  async showHelp(title: string, message: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: title,
      message,
      buttons: ['Entendido'],
    });
    await alert.present();
  }

  formatDay(isoDate: string): string {
    const [y, m, d] = isoDate.split('-');
    if (!y || !m || !d) {
      return isoDate;
    }
    return `${d}/${m}/${y}`;
  }

  /** Muestra Sí/No según lo guardado en ¿Realizó el riego? */
  formatRego(action: string | null | undefined): string {
    if (!action) {
      return '—';
    }
    const n = action.trim().toLowerCase();
    if (n === 'sí' || n === 'si') {
      return 'Sí';
    }
    if (n === 'no') {
      return 'No';
    }
    return action;
  }

  async save(): Promise<void> {
    const crop = this.resolvedCropName();
    const cc = this.parsePercent(this.fieldCapacity);
    const maxLimit = this.parsePercent(this.maxIrrigationLimit);
    const decision = this.parsePercent(this.irrigationDecision);
    const morning = this.parsePercent(this.morningMoisture);
    const afternoon = this.parsePercent(this.afternoonMoisture);
    const recommendation = this.recommendation;

    if (!crop) {
      await this.toast('Indique el cultivo.', 'warning');
      return;
    }
    if (
      cc == null ||
      maxLimit == null ||
      decision == null ||
      morning == null ||
      afternoon == null ||
      !recommendation
    ) {
      await this.toast(
        'Complete CC, límites y ambas humedades para guardar.',
        'warning'
      );
      return;
    }
    if (!this.consultationDate) {
      await this.toast('Indique la fecha de la consulta.', 'warning');
      return;
    }

    this.saving = true;
    try {
      await this.store.save({
        cropName: crop,
        cropId: null,
        fieldCapacity: cc,
        maxIrrigationLimit: maxLimit,
        irrigationDecision: decision,
        consultationDate: this.consultationDate,
        morningMoisture: morning,
        afternoonMoisture: afternoon,
        recommendation,
        irrigationAction: this.irrigationAction,
        observation: this.observation.trim() || null,
      });

      await this.toast('Registro guardado.', 'success');
      this.morningMoisture = '';
      this.afternoonMoisture = '';
      this.observation = '';
      this.irrigationAction = null;
      this.consultationDate = new Date().toISOString().slice(0, 10);
      await this.loadHistory(crop);
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudo guardar el registro',
        'danger'
      );
    } finally {
      this.saving = false;
    }
  }

  private resolvedCropName(): string {
    if (this.isOtherCropSelected) {
      return this.customCropName.trim();
    }
    return this.selectedCrop.trim();
  }

  private async applyCropName(
    name: string,
    fillDefaultsFromCatalog: boolean
  ): Promise<void> {
    const profile = this.calculator.getProfile(name);
    if (fillDefaultsFromCatalog && profile) {
      this.fieldCapacity = this.formatNumber(profile.fieldCapacity);
      this.maxIrrigationLimit = this.formatNumber(profile.maxIrrigationLimit);
      this.irrigationDecision = this.formatNumber(profile.irrigationDecision);
    } else if (!profile && fillDefaultsFromCatalog) {
      this.fieldCapacity = '';
      this.maxIrrigationLimit = '';
      this.irrigationDecision = '';
    } else if (profile && !this.fieldCapacity) {
      this.fieldCapacity = this.formatNumber(profile.fieldCapacity);
      this.maxIrrigationLimit = this.formatNumber(profile.maxIrrigationLimit);
      this.irrigationDecision = this.formatNumber(profile.irrigationDecision);
    }

    this.morningMoisture = '';
    this.afternoonMoisture = '';
    this.observation = '';
    this.irrigationAction = null;
    this.consultationDate = new Date().toISOString().slice(0, 10);
    await this.loadHistory(name);
  }

  private async loadHistory(cropName: string): Promise<void> {
    this.historyLoading = true;
    this.historyEmptyMessage = null;
    try {
      this.history = await this.store.listByCrop(cropName);
      if (!this.history.length) {
        this.historyEmptyMessage = 'No hay datos';
      }
    } catch {
      this.history = [];
      this.historyEmptyMessage = 'No hay datos';
    } finally {
      this.historyLoading = false;
    }
  }

  private async toast(
    message: string,
    color: 'danger' | 'success' | 'warning'
  ): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2500, color });
    await t.present();
  }

  private formatNumber(value: number): string {
    const text = value.toFixed(2);
    return text.replace(/\.?0+$/, '');
  }

  private parsePercent(raw: string): number | null {
    const value = Number(String(raw).trim().replace(',', '.'));
    if (Number.isNaN(value) || value < 0 || value > 100) {
      return null;
    }
    return value;
  }
}
