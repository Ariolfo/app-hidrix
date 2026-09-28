import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  MenuController,
  NavController,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';

import { AuthService } from '../../Shared/Services/auth.service';
import {
  AdminUser,
  AdminUsersService,
} from '../../Shared/Services/admin-users.service';

@Component({
  selector: 'app-admin-users',
  templateUrl: './admin-users.page.html',
  styleUrls: ['./admin-users.page.scss'],
  standalone: false,
})
export class AdminUsersPage implements OnInit, ViewWillEnter {
  loading = true;
  error: string | null = null;
  admins: AdminUser[] = [];
  currentUserId: string | null = null;

  constructor(
    private readonly adminUsers: AdminUsersService,
    private readonly auth: AuthService,
    private readonly menuCtrl: MenuController,
    private readonly navCtrl: NavController,
    private readonly router: Router,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController
  ) {}

  async ngOnInit(): Promise<void> {
    const user = await this.auth.getUser();
    this.currentUserId = user?.id ?? null;
  }

  ionViewWillEnter(): void {
    void this.load();
  }

  async openMenu(): Promise<void> {
    await this.menuCtrl.open('main-menu');
  }

  async goHome(): Promise<void> {
    await this.navCtrl.navigateRoot('/map');
  }

  goCreate(): void {
    void this.router.navigateByUrl('/admin-users/new');
  }

  goEdit(admin: AdminUser): void {
    void this.router.navigateByUrl(`/admin-users/${admin.id}/edit`);
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.admins = await this.adminUsers.list();
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo cargar admins';
      await this.toast(this.error, 'danger');
    } finally {
      this.loading = false;
    }
  }

  isSelf(admin: AdminUser): boolean {
    return !!this.currentUserId && admin.id === this.currentUserId;
  }

  async toggleActive(admin: AdminUser): Promise<void> {
    if (this.isSelf(admin) && admin.active) {
      await this.toast('No puedes inactivar tu propia cuenta.', 'warning');
      return;
    }

    const next = !admin.active;
    const verb = next ? 'activar' : 'inactivar';
    const alert = await this.alertCtrl.create({
      header: next ? 'Activar admin' : 'Inactivar admin',
      message: `¿Deseas ${verb} a ${admin.name}?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Confirmar',
          role: 'confirm',
          handler: () => {
            void this.applyActive(admin, next);
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmDelete(admin: AdminUser): Promise<void> {
    if (this.isSelf(admin)) {
      await this.toast('No puedes eliminar tu propia cuenta.', 'warning');
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Eliminar admin',
      message: `Se eliminará permanentemente a ${admin.name} (${admin.email}).`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            void this.applyDelete(admin);
          },
        },
      ],
    });
    await alert.present();
  }

  private async applyActive(admin: AdminUser, active: boolean): Promise<void> {
    try {
      const updated = await this.adminUsers.setActive(admin.id, active);
      this.admins = this.admins.map((a) => (a.id === updated.id ? updated : a));
      await this.toast(active ? 'Admin activado' : 'Admin inactivado', 'success');
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudo actualizar',
        'danger'
      );
    }
  }

  private async applyDelete(admin: AdminUser): Promise<void> {
    try {
      await this.adminUsers.remove(admin.id);
      this.admins = this.admins.filter((a) => a.id !== admin.id);
      await this.toast('Admin eliminado', 'success');
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
