import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { AlertController, MenuController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline,
  chevronBackOutline,
  chevronDownOutline,
  chevronForwardOutline,
  documentTextOutline,
  downloadOutline,
  flaskOutline,
  helpCircleOutline,
  homeOutline,
  leafOutline,
  logOutOutline,
  mapOutline,
  menuOutline,
  pauseCircleOutline,
  personAddOutline,
  playCircleOutline,
  radioOutline,
  refreshOutline,
  settingsOutline,
  trashOutline,
  waterOutline,
} from 'ionicons/icons';
import { filter, Subject, takeUntil } from 'rxjs';

import { environment } from '../environments/environment';
import { AuthService } from './Shared/Services/auth.service';

addIcons({
  'menu-outline': menuOutline,
  'home-outline': homeOutline,
  'refresh-outline': refreshOutline,
  'map-outline': mapOutline,
  'water-outline': waterOutline,
  'document-text-outline': documentTextOutline,
  'download-outline': downloadOutline,
  'log-out-outline': logOutOutline,
  'help-circle-outline': helpCircleOutline,
  'radio-outline': radioOutline,
  'leaf-outline': leafOutline,
  'add-outline': addOutline,
  'settings-outline': settingsOutline,
  'flask-outline': flaskOutline,
  'person-add-outline': personAddOutline,
  'trash-outline': trashOutline,
  'pause-circle-outline': pauseCircleOutline,
  'play-circle-outline': playCircleOutline,
  'chevron-back-outline': chevronBackOutline,
  'chevron-down-outline': chevronDownOutline,
  'chevron-forward-outline': chevronForwardOutline,
});

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit, OnDestroy {
  readonly appPages = [
    { title: 'Mapa', url: '/map', icon: 'map-outline' },
    {
      title: 'Calculadora de riego',
      url: '/irrigation-calculator',
      icon: 'water-outline',
    },
    {
      title: 'Notas evento riego',
      url: '/irrigation-event-notes',
      icon: 'document-text-outline',
    },
  ];

  /** Visible en el menú principal solo para administradores. */
  readonly adminAppPages = [
    {
      title: 'Descarga eventos riego',
      url: '/download-events',
      icon: 'download-outline',
    },
    {
      title: 'Método para CC',
      url: '/metodos-cc',
      icon: 'flask-outline',
    },
  ];

  readonly adminPages = [
    { title: 'Cultivos', url: '/crops', icon: 'leaf-outline' },
    { title: 'Sensores · cultivos', url: '/sensors', icon: 'radio-outline' },
    { title: 'Crear Admin', url: '/admin-users', icon: 'person-add-outline' },
  ];

  isAdmin = false;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly menuCtrl: MenuController,
    private readonly cdr: ChangeDetectorRef,
    private readonly swUpdate: SwUpdate,
    private readonly alertCtrl: AlertController
  ) {}

  async ngOnInit(): Promise<void> {
    // Hidrata sesión y mantiene isAdmin al día tras login/logout.
    await this.auth.getUser();
    this.auth.user$.pipe(takeUntil(this.destroy$)).subscribe((user) => {
      this.isAdmin = !!user?.roles?.some((r) => r.toLowerCase() === 'admin');
      this.cdr.markForCheck();
    });

    this.watchPwaUpdates();

    if (!Capacitor.isNativePlatform()) {
      return;
    }
    try {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: '#ffffff' });
    } catch {
      // Emuladores sin plugin StatusBar: ignorar.
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async openPage(url: string): Promise<void> {
    await this.menuCtrl.close('main-menu');
    await this.router.navigateByUrl(url);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    await this.menuCtrl.close('main-menu');
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  /** Avisa cuando hay una nueva versión PWA lista para recargar. */
  private watchPwaUpdates(): void {
    if (
      !environment.production ||
      Capacitor.isNativePlatform() ||
      !this.swUpdate.isEnabled
    ) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(
        filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        void this.promptPwaReload();
      });
  }

  private async promptPwaReload(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Actualización disponible',
      message: 'Hay una nueva versión de Hidrix. ¿Recargar ahora?',
      buttons: [
        { text: 'Después', role: 'cancel' },
        {
          text: 'Recargar',
          role: 'confirm',
          handler: () => {
            document.location.reload();
          },
        },
      ],
    });
    await alert.present();
  }
}
