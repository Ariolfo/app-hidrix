import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../Models/api-response';

export type ApiRequestOptions = {
  params?: Record<string, string | number | boolean>;
  token?: string | null;
  /** Envía cookies HttpOnly (modo PWA same-origin). */
  withCredentials?: boolean;
  /** Solicita al backend guardar tokens en cookies en lugar del JSON. */
  cookieAuth?: boolean;
};

/**
 * Cliente HTTP que habla con la API Hidrix y desempaqueta el sobre
 * `{ success, message, data }`.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  /** PWA same-origin: tokens en cookies HttpOnly, no en localStorage/Preferences. */
  readonly usesCookieAuth =
    Capacitor.getPlatform() === 'web' &&
    !this.baseUrl.startsWith('http');

  constructor(private readonly http: HttpClient) {}

  /**
   * Realiza un GET tipado y devuelve solo el payload `data`.
   * @param path Ruta relativa (p. ej. `/stations`).
   * @param options Parámetros y cabeceras opcionales.
   */
  get<T>(path: string, options?: ApiRequestOptions): Observable<T> {
    return this.http
      .get<ApiResponse<T>>(this.url(path), {
        headers: this.headers(options),
        params: this.toParams(options?.params),
        withCredentials: this.resolveCredentials(options),
      })
      .pipe(
        map((res) => this.unwrap(res)),
        catchError((err) => this.handleError(err))
      );
  }

  /**
   * Realiza un POST tipado y devuelve solo el payload `data`.
   * @param path Ruta relativa.
   * @param body Cuerpo JSON.
   * @param options Token, cookies o cabeceras opcionales.
   */
  post<T>(
    path: string,
    body: unknown,
    options?: ApiRequestOptions | string | null
  ): Observable<T> {
    const opts = this.normalizeOptions(options);
    return this.http
      .post<ApiResponse<T>>(this.url(path), body, {
        headers: this.headers(opts),
        withCredentials: this.resolveCredentials(opts),
      })
      .pipe(
        map((res) => this.unwrap(res)),
        catchError((err) => this.handleError(err))
      );
  }

  /**
   * Realiza un PUT tipado y devuelve solo el payload `data`.
   */
  put<T>(
    path: string,
    body: unknown,
    options?: ApiRequestOptions | string | null
  ): Observable<T> {
    const opts = this.normalizeOptions(options);
    return this.http
      .put<ApiResponse<T>>(this.url(path), body, {
        headers: this.headers(opts),
        withCredentials: this.resolveCredentials(opts),
      })
      .pipe(
        map((res) => this.unwrap(res)),
        catchError((err) => this.handleError(err))
      );
  }

  /**
   * Realiza un PATCH tipado y devuelve solo el payload `data`.
   */
  patch<T>(
    path: string,
    body: unknown,
    options?: ApiRequestOptions | string | null
  ): Observable<T> {
    const opts = this.normalizeOptions(options);
    return this.http
      .patch<ApiResponse<T>>(this.url(path), body, {
        headers: this.headers(opts),
        withCredentials: this.resolveCredentials(opts),
      })
      .pipe(
        map((res) => this.unwrap(res)),
        catchError((err) => this.handleError(err))
      );
  }

  /**
   * Realiza un DELETE tipado y devuelve solo el payload `data`.
   */
  delete<T>(path: string, options?: ApiRequestOptions | string | null): Observable<T> {
    const opts = this.normalizeOptions(options);
    return this.http
      .delete<ApiResponse<T>>(this.url(path), {
        headers: this.headers(opts),
        withCredentials: this.resolveCredentials(opts),
      })
      .pipe(
        map((res) => this.unwrap(res)),
        catchError((err) => this.handleError(err))
      );
  }

  /**
   * Descarga un archivo binario (p. ej. Excel). No usa el sobre JSON de la API.
   */
  downloadBlob(path: string, options?: ApiRequestOptions): Observable<Blob> {
    return this.http
      .get(this.url(path), {
        headers: this.downloadHeaders(options),
        params: this.toParams(options?.params),
        responseType: 'blob',
        withCredentials: this.resolveCredentials(options),
      })
      .pipe(catchError((err) => this.handleError(err)));
  }

  private normalizeOptions(
    options?: ApiRequestOptions | string | null
  ): ApiRequestOptions | undefined {
    if (typeof options === 'string' || options === null) {
      return { token: options };
    }
    return options;
  }

  private resolveCredentials(options?: ApiRequestOptions): boolean {
    if (options?.withCredentials === true) {
      return true;
    }
    if (options?.withCredentials === false) {
      return false;
    }
    return this.usesCookieAuth;
  }

  private downloadHeaders(options?: ApiRequestOptions): HttpHeaders {
    let headers = new HttpHeaders();
    const token = options?.token;
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  private url(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${normalized}`;
  }

  private headers(options?: ApiRequestOptions): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    const token = options?.token;
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    if (options?.cookieAuth || (this.usesCookieAuth && options?.cookieAuth !== false)) {
      headers = headers.set('X-Hidrix-Auth-Mode', 'cookie');
    }
    return headers;
  }

  private toParams(
    params?: Record<string, string | number | boolean>
  ): HttpParams | undefined {
    if (!params) {
      return undefined;
    }
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      httpParams = httpParams.set(key, String(value));
    }
    return httpParams;
  }

  private unwrap<T>(res: ApiResponse<T>): T {
    if (!res.success) {
      throw new Error(res.message || 'Error en la API');
    }
    if (res.data === null || res.data === undefined) {
      throw new Error(res.message || 'Respuesta vacía de la API');
    }
    return res.data;
  }

  private handleError(err: unknown): Observable<never> {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ApiResponse<unknown> | string | null;
      if (err.status === 401) {
        const msg =
          body && typeof body === 'object' && 'message' in body && body.message
            ? String(body.message)
            : 'Sesión expirada. Cierre sesión e ingrese de nuevo.';
        return throwError(() => new Error(msg));
      }
      if (body && typeof body === 'object' && 'message' in body) {
        return throwError(() => new Error(body.message || err.message));
      }
      return throwError(
        () => new Error(err.message || `Error HTTP ${err.status}`)
      );
    }
    if (err instanceof Error) {
      return throwError(() => err);
    }
    return throwError(() => new Error('Error de red desconocido'));
  }
}
