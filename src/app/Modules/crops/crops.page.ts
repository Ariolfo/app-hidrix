import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuController, NavController, ToastController, ViewWillEnter } from '@ionic/angular';

import { Crop } from '../../Shared/Models/catalog';
import { CropService } from '../../Shared/Services/crop.service';

@Component({
  selector: 'app-crops',
  templateUrl: './crops.page.html',
  styleUrls: ['./crops.page.scss'],
  standalone: false,
})
export class CropsPage implements OnInit, ViewWillEnter {
  loading = true;
  error: string | null = null;
  crops: Crop[] = [];

  constructor(
    private readonly cropService: CropService,
    private readonly menuCtrl: MenuController,
    private readonly navCtrl: NavController,
    private readonly router: Router,
    private readonly toastCtrl: ToastController
  ) {}

  async ngOnInit(): Promise<void> {
    // La carga ocurre en ionViewWillEnter al entrar o volver a la lista.
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

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.crops = await this.cropService.list(true);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo cargar cultivos';
      const toast = await this.toastCtrl.create({
        message: this.error,
        duration: 2500,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.loading = false;
    }
  }

  goCreate(): void {
    void this.router.navigateByUrl('/crops/new');
  }

  goEdit(crop: Crop): void {
    void this.router.navigateByUrl(`/crops/${crop.id}/edit`);
  }
}
