import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuController, NavController, ToastController, ViewWillEnter } from '@ionic/angular';

import { CatalogSensor } from '../../Shared/Models/catalog';
import { CatalogSensorService } from '../../Shared/Services/catalog-sensor.service';

interface CountryGroup {
  countryName: string;
  networks: NetworkGroup[];
}

interface NetworkGroup {
  networkName: string;
  sensors: CatalogSensor[];
}

@Component({
  selector: 'app-sensors',
  templateUrl: './sensors.page.html',
  styleUrls: ['./sensors.page.scss'],
  standalone: false,
})
export class SensorsPage implements OnInit, ViewWillEnter {
  loading = true;
  error: string | null = null;
  groups: CountryGroup[] = [];

  constructor(
    private readonly catalog: CatalogSensorService,
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
      const sensors = await this.catalog.listSensors();
      this.groups = this.groupByCountryNetwork(sensors);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo cargar el catálogo';
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
    void this.router.navigateByUrl('/sensors/new');
  }

  goEdit(sensor: CatalogSensor): void {
    void this.router.navigateByUrl(`/sensors/${sensor.id}/edit`);
  }

  formatFc(value: number | null | undefined): string {
    if (value == null || Number.isNaN(value)) {
      return '—';
    }
    return value.toFixed(1);
  }

  formatEstimationDate(iso: string | null | undefined): string {
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

  private groupByCountryNetwork(sensors: CatalogSensor[]): CountryGroup[] {
    const byCountry = new Map<string, Map<string, CatalogSensor[]>>();
    for (const s of sensors) {
      const country = s.countryName || 'Sin país';
      const network = s.networkName || 'Sin red';
      if (!byCountry.has(country)) {
        byCountry.set(country, new Map());
      }
      const nets = byCountry.get(country)!;
      if (!nets.has(network)) {
        nets.set(network, []);
      }
      nets.get(network)!.push(s);
    }

    return [...byCountry.entries()].map(([countryName, nets]) => ({
      countryName,
      networks: [...nets.entries()].map(([networkName, list]) => ({
        networkName,
        sensors: list,
      })),
    }));
  }
}
