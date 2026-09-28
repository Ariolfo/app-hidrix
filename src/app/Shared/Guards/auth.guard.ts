import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';

import { AuthService } from '../Services/auth.service';

/**
 * Protege rutas que requieren sesión registrada.
 */
@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  /**
   * Permite el acceso si hay sesión; en caso contrario redirige a registro.
   */
  async canActivate(): Promise<boolean | UrlTree> {
    const ok = await this.auth.checkSession();
    return ok ? true : this.router.createUrlTree(['/login']);
  }
}
