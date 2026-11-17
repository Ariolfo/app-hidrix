import { Injectable, OnDestroy } from '@angular/core';
import { Network, ConnectionStatus } from '@capacitor/network';
import { PluginListenerHandle } from '@capacitor/core';
import { ToastController } from '@ionic/angular';

import { IrrigationCalculationStoreService } from './irrigation-calculation-store.service';
import { IrrigationEventNoteStoreService } from './irrigation-event-note-store.service';

/**
 * Escucha reconexión y sincroniza colas offline del cuaderno
 * (calculadora + notas de riego).
 */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService implements OnDestroy {
  private listener: PluginListenerHandle | null = null;
  private flushing = false;
  private started = false;

  constructor(
    private readonly calcStore: IrrigationCalculationStoreService,
    private readonly noteStore: IrrigationEventNoteStoreService,
    private readonly toastCtrl: ToastController
  ) {}

  /** Arranca el listener de red (idempotente). */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.started = true;

    try {
      this.listener = await Network.addListener(
        'networkStatusChange',
        (status) => {
          if (status.connected) {
            void this.flush({ notify: true });
          }
        }
      );
    } catch {
      // Web sin plugin: igual intentamos un flush inicial.
    }

    const status = await Network.getStatus().catch(
      (): ConnectionStatus => ({
        connected: typeof navigator === 'undefined' ? true : navigator.onLine,
        connectionType: 'unknown',
      })
    );
    if (status.connected) {
      void this.flush({ notify: false });
    }
  }

  /** Sincroniza pendientes de calculadora y notas. */
  async flush(options?: { notify?: boolean }): Promise<void> {
    if (this.flushing) {
      return;
    }
    this.flushing = true;
    try {
      const calc = await this.calcStore.flushOutbox();
      const notes = await this.noteStore.flushOutbox();
      const total = calc + notes;
      if (options?.notify && total > 0) {
        const toast = await this.toastCtrl.create({
          message:
            total === 1
              ? 'Se sincronizó 1 registro pendiente del cuaderno.'
              : `Se sincronizaron ${total} registros pendientes del cuaderno.`,
          duration: 2800,
          color: 'success',
        });
        await toast.present();
      }
    } finally {
      this.flushing = false;
    }
  }

  ngOnDestroy(): void {
    void this.listener?.remove();
    this.listener = null;
  }
}
