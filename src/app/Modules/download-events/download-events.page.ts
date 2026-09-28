import { Component } from '@angular/core';
import { MenuController, NavController, ToastController } from '@ionic/angular';

import { IrrigationEventExportService } from '../../Shared/Services/irrigation-event-export.service';

@Component({
  selector: 'app-download-events',
  templateUrl: './download-events.page.html',
  styleUrls: ['./download-events.page.scss'],
  standalone: false,
})
export class DownloadEventsPage {
  fromDate = this.firstDayOfMonth();
  toDate = new Date().toISOString().slice(0, 10);
  downloading = false;

  constructor(
    private readonly exportService: IrrigationEventExportService,
    private readonly toastCtrl: ToastController,
    private readonly menuCtrl: MenuController,
    private readonly navCtrl: NavController
  ) {}

  async openMenu(): Promise<void> {
    await this.menuCtrl.open('main-menu');
  }

  async goHome(): Promise<void> {
    await this.navCtrl.navigateRoot('/map');
  }

  async download(): Promise<void> {
    if (!this.fromDate || !this.toDate) {
      await this.toast('Indique el rango de fechas.', 'warning');
      return;
    }
    if (this.toDate < this.fromDate) {
      await this.toast('La fecha final debe ser posterior o igual a la inicial.', 'warning');
      return;
    }

    this.downloading = true;
    try {
      await this.exportService.downloadExcel(this.fromDate, this.toDate);
      await this.toast('Archivo descargado.', 'success');
    } catch (e) {
      await this.toast(
        e instanceof Error ? e.message : 'No se pudo descargar el archivo',
        'danger'
      );
    } finally {
      this.downloading = false;
    }
  }

  private firstDayOfMonth(): string {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}-01`;
  }

  private async toast(
    message: string,
    color: 'danger' | 'success' | 'warning'
  ): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2500, color });
    await t.present();
  }
}
