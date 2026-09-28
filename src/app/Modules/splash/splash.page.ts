import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../Shared/Services/auth.service';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  styleUrls: ['./splash.page.scss'],
  standalone: false,
})
export class SplashPage implements OnInit {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    await new Promise((r) => setTimeout(r, 1600));
    const hasSession = await this.auth.checkSession();
    await this.router.navigateByUrl(hasSession ? '/map' : '/login', {
      replaceUrl: true,
    });
  }
}
