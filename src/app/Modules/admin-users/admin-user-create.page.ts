import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertController,
  MenuController,
  NavController,
  ToastController,
} from '@ionic/angular';

import { GeoCity, GeoCountry, GeoDepartment } from '../../Shared/Models/geo';
import { AuthService } from '../../Shared/Services/auth.service';
import {
  AdminUser,
  AdminUsersService,
} from '../../Shared/Services/admin-users.service';
import { GeoService } from '../../Shared/Services/geo.service';

@Component({
  selector: 'app-admin-user-create',
  templateUrl: './admin-user-create.page.html',
  styleUrls: ['./admin-user-create.page.scss'],
  standalone: false,
})
export class AdminUserCreatePage implements OnInit {
  form: FormGroup;
  submitting = false;
  loading = false;
  showPassword = false;
  editId: string | null = null;
  admin: AdminUser | null = null;
  currentUserId: string | null = null;

  countries: GeoCountry[] = [];
  departments: GeoDepartment[] = [];
  cities: GeoCity[] = [];
  catalogLoading = true;
  catalogError: string | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly adminUsers: AdminUsersService,
    private readonly auth: AuthService,
    private readonly geo: GeoService,
    private readonly route: ActivatedRoute,
    private readonly menuCtrl: MenuController,
    private readonly navCtrl: NavController,
    private readonly router: Router,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(120)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      countryId: [null as number | null, Validators.required],
      departmentId: [null as number | null, Validators.required],
      cityId: [null as number | null, Validators.required],
    });
  }

  get isEdit(): boolean {
    return this.editId != null;
  }

  get pageTitle(): string {
    return this.isEdit ? 'Consultar admin' : 'Nuevo admin';
  }

  get isSelf(): boolean {
    return !!this.editId && this.editId === this.currentUserId;
  }

  async ngOnInit(): Promise<void> {
    const user = await this.auth.getUser();
    this.currentUserId = user?.id ?? null;
    await this.loadCountries();
    this.route.paramMap.subscribe((params) => {
      void this.loadFromRoute(params.get('id'));
    });
  }

  async loadCountries(): Promise<void> {
    this.catalogLoading = true;
    this.catalogError = null;
    try {
      this.countries = await this.geo.getCountries();
      const colombia = this.countries.find((c) =>
        c.name.toLowerCase().includes('colombia')
      );
      if (colombia && !this.isEdit) {
        this.form.patchValue({ countryId: colombia.id });
        await this.onCountryChange(colombia.id);
      }
    } catch (e) {
      this.catalogError =
        e instanceof Error
          ? e.message
          : 'No pudimos cargar el catálogo geográfico.';
    } finally {
      this.catalogLoading = false;
    }
  }

  async onCountryChange(paisId: number | null): Promise<void> {
    this.departments = [];
    this.cities = [];
    this.form.patchValue({ departmentId: null, cityId: null });
    if (paisId == null) {
      return;
    }
    try {
      this.departments = await this.geo.getDepartments(paisId);
      if (!this.isEdit) {
        const valle = this.departments.find((d) =>
          d.name.toLowerCase().includes('valle')
        );
        if (valle) {
          this.form.patchValue({ departmentId: valle.id });
          await this.onDepartmentChange(valle.id);
        }
      }
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'Error al cargar departamentos',
        'danger'
      );
    }
  }

  async onDepartmentChange(depoId: number | null): Promise<void> {
    this.cities = [];
    this.form.patchValue({ cityId: null });
    if (depoId == null) {
      return;
    }
    try {
      this.cities = await this.geo.getCities(depoId);
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'Error al cargar ciudades',
        'danger'
      );
    }
  }

  async openMenu(): Promise<void> {
    await this.menuCtrl.open('main-menu');
  }

  async goHome(): Promise<void> {
    await this.navCtrl.navigateRoot('/map');
  }

  goToList(): void {
    void this.router.navigateByUrl('/admin-users');
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;
    try {
      if (this.isEdit && this.editId) {
        await this.adminUsers.update(
          this.editId,
          (this.form.value.name as string).trim()
        );
        await this.toast('Admin actualizado', 'success');
        await this.loadAdmin(this.editId);
      } else {
        const country = this.countries.find(
          (c) => c.id === this.form.value.countryId
        );
        const department = this.departments.find(
          (d) => d.id === this.form.value.departmentId
        );
        const city = this.cities.find((c) => c.id === this.form.value.cityId);
        if (!country || !department || !city) {
          await this.toast('Selecciona país, departamento y ciudad válidos.', 'warning');
          return;
        }

        const created = await this.adminUsers.create({
          name: (this.form.value.name as string).trim(),
          email: (this.form.value.email as string).trim(),
          password: this.form.value.password as string,
          country: country.name,
          department: department.name,
          city: city.name,
        });
        await this.toast('Admin creado', 'success');
        await this.router.navigateByUrl(`/admin-users/${created.id}/edit`, {
          replaceUrl: true,
        });
      }
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudo guardar',
        'danger'
      );
    } finally {
      this.submitting = false;
    }
  }

  async toggleActive(): Promise<void> {
    if (!this.admin) {
      return;
    }
    if (this.isSelf && this.admin.active) {
      await this.toast('No puedes inactivar tu propia cuenta.', 'warning');
      return;
    }

    const next = !this.admin.active;
    const verb = next ? 'activar' : 'inactivar';
    const alert = await this.alertCtrl.create({
      header: next ? 'Activar admin' : 'Inactivar admin',
      message: `¿Deseas ${verb} a ${this.admin.name}?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Confirmar',
          role: 'confirm',
          handler: () => {
            void this.applyActive(next);
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmDelete(): Promise<void> {
    if (!this.admin || this.isSelf) {
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Eliminar admin',
      message: `Se eliminará permanentemente a ${this.admin.name} (${this.admin.email}).`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            void this.deleteAdmin();
          },
        },
      ],
    });
    await alert.present();
  }

  locationLabel(admin: AdminUser): string {
    const parts = [admin.department, admin.city].filter(Boolean);
    if (admin.country) {
      parts.unshift(admin.country);
    }
    return parts.length ? parts.join(' · ') : 'Sin ubicación registrada';
  }

  private async loadFromRoute(idParam: string | null): Promise<void> {
    if (!idParam) {
      this.editId = null;
      this.admin = null;
      this.form.reset({
        name: '',
        email: '',
        password: '',
        countryId: null,
        departmentId: null,
        cityId: null,
      });
      this.form.get('email')?.enable();
      this.form.get('password')?.setValidators([
        Validators.required,
        Validators.minLength(8),
      ]);
      this.form.get('countryId')?.setValidators([Validators.required]);
      this.form.get('departmentId')?.setValidators([Validators.required]);
      this.form.get('cityId')?.setValidators([Validators.required]);
      this.form.get('password')?.updateValueAndValidity();
      this.form.get('countryId')?.updateValueAndValidity();
      this.form.get('departmentId')?.updateValueAndValidity();
      this.form.get('cityId')?.updateValueAndValidity();
      if (this.countries.length) {
        const colombia = this.countries.find((c) =>
          c.name.toLowerCase().includes('colombia')
        );
        if (colombia) {
          this.form.patchValue({ countryId: colombia.id });
          await this.onCountryChange(colombia.id);
        }
      }
      return;
    }

    this.editId = idParam;
    this.form.get('email')?.disable();
    this.form.get('password')?.clearValidators();
    this.form.get('countryId')?.clearValidators();
    this.form.get('departmentId')?.clearValidators();
    this.form.get('cityId')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    this.form.get('countryId')?.updateValueAndValidity();
    this.form.get('departmentId')?.updateValueAndValidity();
    this.form.get('cityId')?.updateValueAndValidity();
    await this.loadAdmin(idParam);
  }

  private async loadAdmin(id: string): Promise<void> {
    this.loading = true;
    try {
      this.admin = await this.adminUsers.getById(id);
      this.form.patchValue({
        name: this.admin.name,
        email: this.admin.email,
        password: '',
      });
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudo cargar el admin',
        'danger'
      );
      await this.router.navigateByUrl('/admin-users');
    } finally {
      this.loading = false;
    }
  }

  private async applyActive(active: boolean): Promise<void> {
    if (!this.admin) {
      return;
    }

    try {
      this.admin = await this.adminUsers.setActive(this.admin.id, active);
      await this.toast(active ? 'Admin activado' : 'Admin inactivado', 'success');
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudo actualizar',
        'danger'
      );
    }
  }

  private async deleteAdmin(): Promise<void> {
    if (!this.admin) {
      return;
    }

    try {
      await this.adminUsers.remove(this.admin.id);
      await this.toast('Admin eliminado', 'success');
      await this.router.navigateByUrl('/admin-users', { replaceUrl: true });
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
