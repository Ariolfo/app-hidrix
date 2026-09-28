import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { AuthService } from './auth.service';

/**
 * Exportación Excel de notas de evento de riego (admin).
 */
@Injectable({ providedIn: 'root' })
export class IrrigationEventExportService {
  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService
  ) {}

  /** Descarga el Excel en el rango de fechas indicado. */
  async downloadExcel(fromDate: string, toDate: string): Promise<void> {
    const token = await this.auth.getAccessToken();
    const blob = await firstValueFrom(
      this.api.downloadBlob('/irrigation-event-notes/export', {
        token,
        params: { from: fromDate, to: toDate },
      })
    );

    if (blob.type.includes('json')) {
      const message = await this.readJsonError(blob);
      throw new Error(message);
    }

    const fileName = `notas-evento-riego_${fromDate}_${toDate}.xlsx`;
    this.triggerDownload(blob, fileName);
  }

  private async readJsonError(blob: Blob): Promise<string> {
    try {
      const text = await blob.text();
      const parsed = JSON.parse(text) as { message?: string };
      return parsed.message || 'No se pudo descargar el archivo';
    } catch {
      return 'No se pudo descargar el archivo';
    }
  }

  private triggerDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
