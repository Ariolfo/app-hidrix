import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, NavController, ToastController } from '@ionic/angular';

import { CatalogSensor, Crop } from '../../Shared/Models/catalog';
import { CatalogSensorService } from '../../Shared/Services/catalog-sensor.service';
import { CropService } from '../../Shared/Services/crop.service';

@Component({
  selector: 'app-sensor-crop',
  templateUrl: './sensor-crop.page.html',
  styleUrls: ['./sensor-crop.page.scss'],
  standalone: false,
})
export class SensorCropPage implements OnInit {
  sensors: CatalogSensor[] = [];
  crops: Crop[] = [];
  saving = false;
  loading = false;
  editId: number | null = null;
  estimatedFc: number | null = null;
  estimationMethod: string | null = null;
  estimationDate: string | null = null;
  deviceName: string | null = null;

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(50)]],
    cropId: [null as number | null],
    farm: [''],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly catalog: CatalogSensorService,
    private readonly cropService: CropService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly navCtrl: NavController,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController
  ) {}

  get isEdit(): boolean {
    return this.editId != null;
  }

  get pageTitle(): string {
    return this.isEdit ? 'Relación sensor–cultivo' : 'Asignar cultivo';
  }

  formatEstimationDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return '—';
    }
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      void this.loadFromRoute(params.get('id'));
    });
  }

  async goHome(): Promise<void> {
    await this.navCtrl.navigateRoot('/map');
  }

  onSensorPicked(serial: string | null | undefined): void {
    const sensor = this.sensors.find((s) => s.name === serial);
    this.deviceName = sensor?.deviceName ?? null;
    if (this.isEdit || !sensor) {
      return;
    }
    this.form.patchValue({
      cropId: sensor.cropId ?? null,
      farm: sensor.farm || '',
    });
    this.estimatedFc = sensor.estimatedFieldCapacity ?? null;
    this.estimationMethod = sensor.estimationMethod ?? null;
    this.estimationDate = sensor.estimationDate ?? null;
    this.editId = sensor.id > 0 ? sensor.id : null;
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    const payload = {
      name: (v.name ?? '').trim().toUpperCase(),
      cropId: v.cropId != null ? Number(v.cropId) : null,
      farm: v.farm?.trim() || null,
    };
    try {
      // Upsert por serial Visualiti (crea o actualiza metadatos).
      const saved = await this.catalog.assignCrop(payload);
      await this.toast('Relación guardada', 'success');
      await this.router.navigateByUrl(`/sensors/${saved.id}/edit`, {
        replaceUrl: true,
      });
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudo guardar',
        'danger'
      );
    } finally {
      this.saving = false;
    }
  }

  async confirmClearCrop(): Promise<void> {
    if (this.editId == null) {
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Quitar cultivo',
      message:
        '¿Desea desasignar el cultivo de este sensor? La CC estimada se conserva.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Quitar',
          role: 'destructive',
          handler: () => {
            void this.clearCrop();
          },
        },
      ],
    });
    await alert.present();
  }

  goToList(): void {
    void this.router.navigateByUrl('/sensors');
  }

  private async loadFromRoute(idParam: string | null): Promise<void> {
    this.loading = true;
    try {
      const [sensors, crops] = await Promise.all([
        this.catalog.listSensors(),
        this.cropService.list(),
      ]);
      this.sensors = sensors;
      this.crops = crops;

      if (!idParam) {
        this.editId = null;
        this.estimatedFc = null;
        this.estimationMethod = null;
        this.estimationDate = null;
        this.deviceName = null;
        this.form.reset({
          name: '',
          cropId: null,
          farm: '',
        });
        this.form.controls.name.enable({ emitEvent: false });
        return;
      }

      const id = Number(idParam);
      if (!Number.isFinite(id)) {
        return;
      }

      this.editId = id;
      const sensor = await this.catalog.getById(id);
      this.estimatedFc = sensor.estimatedFieldCapacity ?? null;
      this.estimationMethod = sensor.estimationMethod ?? null;
      this.estimationDate = sensor.estimationDate ?? null;
      this.deviceName = sensor.deviceName ?? null;
      this.form.patchValue({
        name: sensor.name,
        cropId: sensor.cropId ?? null,
        farm: sensor.farm || '',
      });
      this.form.controls.name.disable({ emitEvent: false });
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudo cargar el sensor',
        'danger'
      );
      if (this.editId != null) {
        await this.router.navigateByUrl('/sensors');
      }
    } finally {
      this.loading = false;
    }
  }

  private async clearCrop(): Promise<void> {
    if (this.editId == null) {
      return;
    }

    try {
      await this.catalog.clearCrop(this.editId);
      await this.toast('Cultivo desasignado', 'success');
      await this.router.navigateByUrl('/sensors', { replaceUrl: true });
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudo desasignar',
        'danger'
      );
    }
  }

  private async toast(
    message: string,
    color: 'danger' | 'success' | 'warning'
  ): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2500, color });
    await t.present();
  }
}
