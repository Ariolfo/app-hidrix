import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';

import { AuthService } from '../../Shared/Services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage {
  form: FormGroup;
  submitting = false;
  showPassword = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly toastCtrl: ToastController
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(1)]],
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const emailCtrl = this.form.get('email');
      if (emailCtrl?.hasError('email')) {
        await this.showToast(
          'Use su correo electrónico completo (ej. nombre@empresa.com), no el usuario.'
        );
      } else if (emailCtrl?.hasError('required')) {
        await this.showToast('Ingrese su correo electrónico.');
      } else {
        await this.showToast('Complete correo y contraseña.');
      }
      return;
    }

    this.submitting = true;
    try {
      await this.auth.login({
        email: this.form.value.email as string,
        password: this.form.value.password as string,
      });
      await this.router.navigateByUrl('/map', { replaceUrl: true });
    } catch (e) {
      await this.showToast(
        e instanceof Error ? e.message : 'Correo o contraseña incorrectos'
      );
    } finally {
      this.submitting = false;
    }
  }

  goToRegister(): void {
    this.router.navigateByUrl('/register');
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3200,
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  }
}
