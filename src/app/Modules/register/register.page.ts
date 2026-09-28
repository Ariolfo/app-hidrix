import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';

import { GeoCity, GeoCountry, GeoDepartment } from '../../Shared/Models/geo';
import { AuthService } from '../../Shared/Services/auth.service';
import { GeoService } from '../../Shared/Services/geo.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: false,
})
export class RegisterPage implements OnInit {
  form: FormGroup;
  countries: GeoCountry[] = [];
  departments: GeoDepartment[] = [];
  cities: GeoCity[] = [];
  catalogLoading = true;
  catalogError: string | null = null;
  submitting = false;
  showPassword = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly geo: GeoService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly toastCtrl: ToastController
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      name: ['', [Validators.required, Validators.minLength(2)]],
      countryId: [null as number | null, Validators.required],
      departmentId: [null as number | null, Validators.required],
      cityId: [null as number | null, Validators.required],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadCountries();
  }

  async loadCountries(): Promise<void> {
    this.catalogLoading = true;
    this.catalogError = null;
    try {
      this.countries = await this.geo.getCountries();
      const colombia = this.countries.find((c) =>
        c.name.toLowerCase().includes('colombia')
      );
      if (colombia) {
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
      const valle = this.departments.find((d) =>
        d.name.toLowerCase().includes('valle')
      );
      if (valle) {
        this.form.patchValue({ departmentId: valle.id });
        await this.onDepartmentChange(valle.id);
      }
    } catch (e) {
      await this.showToast(
        e instanceof Error ? e.message : 'Error al cargar departamentos'
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
      await this.showToast(
        e instanceof Error ? e.message : 'Error al cargar ciudades'
      );
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      await this.showToast('Completa todos los campos correctamente.');
      return;
    }

    const country = this.countries.find(
      (c) => c.id === this.form.value.countryId
    );
    const department = this.departments.find(
      (d) => d.id === this.form.value.departmentId
    );
    const city = this.cities.find((c) => c.id === this.form.value.cityId);
    if (!country || !department || !city) {
      await this.showToast('Selecciona país, departamento y ciudad válidos.');
      return;
    }

    this.submitting = true;
    try {
      const auth = await this.auth.register({
        email: this.form.value.email as string,
        password: this.form.value.password as string,
        name: this.form.value.name as string,
        country: country.name,
        department: department.name,
        city: city.name,
      });
      if (auth.emailConfirmationRequired) {
        await this.showToast(
          'Registro recibido. Confirme su correo electrónico antes de iniciar sesión.',
          'success'
        );
        await this.router.navigateByUrl('/login', { replaceUrl: true });
        return;
      }
      await this.router.navigateByUrl('/map', { replaceUrl: true });
    } catch (e) {
      await this.showToast(
        e instanceof Error ? e.message : 'No se pudo completar el registro'
      );
    } finally {
      this.submitting = false;
    }
  }

  goToLogin(): void {
    this.router.navigateByUrl('/login');
  }

  private async showToast(message: string, color: 'danger' | 'success' = 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3200,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
