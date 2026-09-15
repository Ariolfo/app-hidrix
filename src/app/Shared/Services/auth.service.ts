import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

import {
  AuthResponse,
  LoginRequest,
  RefreshResponse,
  RegisterRequest,
  User,
} from '../Models/user';
import { UserLocation } from '../Models/geo';
import { ApiService } from './api.service';

const KEY_ACCESS = 'hidrix_access_token';
const KEY_REFRESH = 'hidrix_refresh_token';
const KEY_USER = 'hidrix_user';

/**
 * Autenticación con email y contraseña: registro, login, refresh y persistencia.
 * Web PWA (same-origin): cookies HttpOnly. Móvil/dev: Preferences + Bearer.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private currentUser: User | null = null;
  private hydrated = false;
  private cookieSession = false;
  private readonly userSubject = new BehaviorSubject<User | null>(null);

  /** Emite el usuario actual (null si no hay sesión). */
  readonly user$ = this.userSubject.asObservable();

  constructor(private readonly api: ApiService) {}

  /**
   * Registra al usuario en el backend y guarda tokens + perfil localmente.
   */
  async register(
    payload: Omit<RegisterRequest, 'platform'> & { platform?: string }
  ): Promise<AuthResponse> {
    const body: RegisterRequest = {
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      name: payload.name.trim(),
      country: payload.country,
      department: payload.department,
      city: payload.city,
      platform: payload.platform ?? this.detectPlatform(),
      ...(payload.deviceId ? { deviceId: payload.deviceId } : {}),
    };

    const auth = await firstValueFrom(
      this.api.post<AuthResponse>('/auth/register', body, {
        cookieAuth: this.api.usesCookieAuth,
      })
    );
    if (auth.emailConfirmationRequired) {
      return auth;
    }
    await this.persistAuthResponse(auth);
    return auth;
  }

  /**
   * Inicia sesión con email y contraseña.
   */
  async login(
    payload: Omit<LoginRequest, 'platform'> & { platform?: string }
  ): Promise<AuthResponse> {
    const body: LoginRequest = {
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      platform: payload.platform ?? this.detectPlatform(),
      ...(payload.deviceId ? { deviceId: payload.deviceId } : {}),
    };

    const auth = await firstValueFrom(
      this.api.post<AuthResponse>('/auth/login', body, {
        cookieAuth: this.api.usesCookieAuth,
      })
    );
    await this.persistAuthResponse(auth);
    return auth;
  }

  /**
   * Renueva el access token usando el refresh token almacenado.
   */
  async refresh(): Promise<boolean> {
    await this.ensureHydrated();
    if (this.api.usesCookieAuth) {
      if (!this.cookieSession && !this.currentUser) {
        return false;
      }
      try {
        await firstValueFrom(
          this.api.post<RefreshResponse>('/auth/refresh', {}, {
            cookieAuth: this.api.usesCookieAuth,
          })
        );
        this.cookieSession = true;
        return true;
      } catch {
        return false;
      }
    }

    if (!this.refreshToken) {
      return false;
    }
    try {
      const result = await firstValueFrom(
        this.api.post<RefreshResponse>('/auth/refresh', {
          refreshToken: this.refreshToken,
        })
      );
      const nextRefresh = result.refreshToken ?? this.refreshToken;
      await this.persistSession(result.accessToken, nextRefresh, this.currentUser);
      return true;
    } catch {
      return false;
    }
  }

  async hasSession(): Promise<boolean> {
    await this.ensureHydrated();
    if (this.api.usesCookieAuth) {
      return this.cookieSession || !!this.currentUser;
    }
    return !!(this.accessToken || this.refreshToken);
  }

  async checkSession(): Promise<boolean> {
    await this.ensureHydrated();
    if (this.api.usesCookieAuth) {
      if (!this.cookieSession && !this.currentUser) {
        return false;
      }
      return this.refresh();
    }

    if (!this.accessToken && !this.refreshToken) {
      return false;
    }
    if (this.shouldRefreshAccessToken()) {
      return this.refresh();
    }
    return !!this.accessToken;
  }

  async getAccessToken(): Promise<string | null> {
    await this.ensureHydrated();
    if (this.api.usesCookieAuth) {
      return null;
    }

    if (!this.accessToken && !this.refreshToken) {
      return null;
    }
    if (this.shouldRefreshAccessToken()) {
      const ok = await this.refresh();
      if (!ok) {
        return null;
      }
    }
    return this.accessToken;
  }

  /** Renueva la sesión si hace falta y devuelve un access token válido (null en modo cookie). */
  async getValidAccessToken(): Promise<string | null> {
    await this.ensureHydrated();
    if (this.api.usesCookieAuth) {
      return null;
    }
    return this.getAccessToken();
  }

  async getUser(): Promise<User | null> {
    await this.ensureHydrated();
    return this.currentUser;
  }

  /** Ubicación del usuario (país, departamento y ciudad del catálogo). */
  async getUserLocation(): Promise<UserLocation | null> {
    const user = await this.getUser();
    if (
      user?.countryId != null &&
      user?.departmentId != null &&
      user?.cityId != null
    ) {
      return {
        countryId: user.countryId,
        departmentId: user.departmentId,
        cityId: user.cityId,
        countryName: user.country ?? null,
        departmentName: user.department ?? null,
        cityName: user.city ?? null,
      };
    }

    try {
      const location = await firstValueFrom(
        this.api.get<UserLocation>('/auth/location', {
          token: await this.getValidAccessToken(),
        })
      );
      if (user && location) {
        await this.persistUserProfile({
          ...user,
          countryId: location.countryId,
          departmentId: location.departmentId,
          cityId: location.cityId,
          country: location.countryName ?? user.country,
          department: location.departmentName ?? user.department,
          city: location.cityName ?? user.city,
        });
      }
      return location;
    } catch {
      return null;
    }
  }

  async isAdmin(): Promise<boolean> {
    try {
      const me = await firstValueFrom(
        this.api.get<User>('/auth/me', {
          token: await this.getValidAccessToken(),
        })
      );
      return this.hasAdminRole(me);
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    if (this.api.usesCookieAuth) {
      try {
        await firstValueFrom(
          this.api.post('/auth/logout', {}, { cookieAuth: this.api.usesCookieAuth })
        );
      } catch {
        // Ignorar errores de red al cerrar sesión.
      }
    }

    this.accessToken = null;
    this.refreshToken = null;
    this.currentUser = null;
    this.cookieSession = false;
    this.userSubject.next(null);
    await Preferences.remove({ key: KEY_ACCESS });
    await Preferences.remove({ key: KEY_REFRESH });
    await Preferences.remove({ key: KEY_USER });
  }

  private hasAdminRole(user: User | null): boolean {
    return !!user?.roles?.some((r) => r.toLowerCase() === 'admin');
  }

  private async persistAuthResponse(auth: AuthResponse): Promise<void> {
    if (this.api.usesCookieAuth) {
      this.cookieSession = true;
      await this.persistUserProfile(auth.user);
      return;
    }
    await this.persistSession(auth.accessToken, auth.refreshToken, auth.user);
  }

  private async persistSession(
    access: string,
    refresh: string,
    user: User | null
  ): Promise<void> {
    this.accessToken = access;
    this.refreshToken = refresh;
    this.currentUser = user;
    this.hydrated = true;
    this.userSubject.next(user);
    await Preferences.set({ key: KEY_ACCESS, value: access });
    await Preferences.set({ key: KEY_REFRESH, value: refresh });
    if (user) {
      await Preferences.set({ key: KEY_USER, value: JSON.stringify(user) });
    }
  }

  private async persistUserProfile(user: User | null): Promise<void> {
    this.currentUser = user;
    this.hydrated = true;
    this.userSubject.next(user);
    if (user) {
      await Preferences.set({ key: KEY_USER, value: JSON.stringify(user) });
    } else {
      await Preferences.remove({ key: KEY_USER });
    }
  }

  private async ensureHydrated(): Promise<void> {
    if (this.hydrated) {
      return;
    }

    if (this.api.usesCookieAuth) {
      const userRaw = await Preferences.get({ key: KEY_USER });
      if (userRaw.value) {
        try {
          this.currentUser = JSON.parse(userRaw.value) as User;
          this.cookieSession = true;
        } catch {
          this.currentUser = null;
        }
      }
      this.hydrated = true;
      this.userSubject.next(this.currentUser);
      return;
    }

    const [access, refresh, userRaw] = await Promise.all([
      Preferences.get({ key: KEY_ACCESS }),
      Preferences.get({ key: KEY_REFRESH }),
      Preferences.get({ key: KEY_USER }),
    ]);
    this.accessToken = access.value;
    this.refreshToken = refresh.value;
    if (userRaw.value) {
      try {
        this.currentUser = JSON.parse(userRaw.value) as User;
      } catch {
        this.currentUser = null;
      }
    }
    this.hydrated = true;
    this.userSubject.next(this.currentUser);
  }

  private detectPlatform(): string {
    const p = Capacitor.getPlatform();
    if (p === 'android' || p === 'ios' || p === 'web') {
      return p;
    }
    return 'web';
  }

  /** true si no hay access token o está por expirar (renovar con refresh). */
  private shouldRefreshAccessToken(): boolean {
    if (!this.accessToken) {
      return !!this.refreshToken;
    }
    return this.isJwtExpired(this.accessToken, 60);
  }

  private isJwtExpired(token: string, skewSeconds: number): boolean {
    try {
      const payloadPart = token.split('.')[1];
      if (!payloadPart) {
        return true;
      }
      const json = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(json) as { exp?: number };
      if (typeof payload.exp !== 'number') {
        return false;
      }
      return Date.now() / 1000 >= payload.exp - skewSeconds;
    } catch {
      return true;
    }
  }
}
