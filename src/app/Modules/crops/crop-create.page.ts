import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, NavController, ToastController } from '@ionic/angular';

import { CropService } from '../../Shared/Services/crop.service';

@Component({
  selector: 'app-crop-create',
  templateUrl: './crop-create.page.html',
  styleUrls: ['./crop-create.page.scss'],
  standalone: false,
})
export class CropCreatePage implements OnInit {
  saving = false;
  loading = false;
  editId: number | null = null;

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    fieldCapacity: [null as number | null, [Validators.required]],
    maxIrrigationLimit: [null as number | null, [Validators.required]],
    irrigationDecision: [null as number | null, [Validators.required]],
  });

  constructor(
    private readonly fb: FormBuilder,
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
    return this.isEdit ? 'Consultar cultivo' : 'Nuevo cultivo';
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      void this.loadFromRoute(params.get('id'));
    });
  }

  async goHome(): Promise<void> {
    await this.navCtrl.navigateRoot('/map');
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    const payload = {
      name: (v.name ?? '').trim(),
      fieldCapacity: Number(v.fieldCapacity),
      maxIrrigationLimit: Number(v.maxIrrigationLimit),
      irrigationDecision: Number(v.irrigationDecision),
    };
    try {
      if (this.editId != null) {
        await this.cropService.update(this.editId, payload);
        await this.toast('Cultivo actualizado', 'success');
      } else {
        const created = await this.cropService.create(payload);
        await this.toast('Cultivo creado', 'success');
        await this.router.navigateByUrl(`/crops/${created.id}/edit`, {
          replaceUrl: true,
        });
      }
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudo guardar',
        'danger'
      );
    } finally {
      this.saving = false;
    }
  }

  async confirmDelete(): Promise<void> {
    if (this.editId == null) {
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Eliminar cultivo',
      message: '¿Desea eliminar este cultivo del catálogo?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            void this.deleteCrop();
          },
        },
      ],
    });
    await alert.present();
  }

  goToList(): void {
    void this.router.navigateByUrl('/crops');
  }

  private async loadFromRoute(idParam: string | null): Promise<void> {
    if (!idParam) {
      this.editId = null;
      this.form.reset({
        name: '',
        fieldCapacity: null,
        maxIrrigationLimit: null,
        irrigationDecision: null,
      });
      return;
    }

    const id = Number(idParam);
    if (!Number.isFinite(id)) {
      return;
    }

    this.editId = id;
    this.loading = true;
    try {
      const crop = await this.cropService.getById(id);
      this.form.patchValue({
        name: crop.name,
        fieldCapacity: crop.fieldCapacity,
        maxIrrigationLimit: crop.maxIrrigationLimit,
        irrigationDecision: crop.irrigationDecision,
      });
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudo cargar el cultivo',
        'danger'
      );
      await this.router.navigateByUrl('/crops');
    } finally {
      this.loading = false;
    }
  }

  private async deleteCrop(): Promise<void> {
    if (this.editId == null) {
      return;
    }

    try {
      await this.cropService.remove(this.editId);
      await this.toast('Cultivo eliminado', 'success');
      await this.router.navigateByUrl('/crops', { replaceUrl: true });
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudo eliminar',
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
