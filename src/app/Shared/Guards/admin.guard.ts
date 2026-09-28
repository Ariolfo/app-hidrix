import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';

import { AuthService } from '../Services/auth.service';

/**
 * Protege rutas que requieren el rol Admin.
 */
@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  /**
   * Permite el acceso solo si el usuario autenticado tiene rol Admin.
   */
  async canActivate(): Promise<boolean | UrlTree> {
    const admin = await this.auth.isAdmin();
    return admin ? true : this.router.createUrlTree(['/map']);
  }
}
