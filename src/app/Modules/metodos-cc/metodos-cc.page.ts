import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { MenuController, NavController } from '@ionic/angular';

import { METODOS_CC_AUTOMATIZADOS } from './metodos-cc.data';

/**
 * Catálogo admin de métodos para estimación automática de CC.
 */
@Component({
  selector: 'app-metodos-cc',
  templateUrl: './metodos-cc.page.html',
  styleUrls: ['./metodos-cc.page.scss'],
  standalone: false,
})
export class MetodosCCPage {
  readonly methods = METODOS_CC_AUTOMATIZADOS;

  constructor(
    private readonly router: Router,
    private readonly menuCtrl: MenuController,
    private readonly navCtrl: NavController
  ) {}

  openMethod(key: string): void {
    void this.router.navigateByUrl(`/metodos-cc/${key}/estimate`);
  }

  async openMenu(): Promise<void> {
    await this.menuCtrl.open('main-menu');
  }

  async goHome(): Promise<void> {
    await this.navCtrl.navigateRoot('/map');
  }
}
