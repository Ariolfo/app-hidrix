import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';

import { AdminUserCreatePage } from './admin-user-create.page';
import { AdminUsersPage } from './admin-users.page';

const routes: Routes = [
  { path: '', component: AdminUsersPage },
  { path: 'new', component: AdminUserCreatePage },
  { path: ':id/edit', component: AdminUserCreatePage },
];

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonicModule,
    RouterModule.forChild(routes),
  ],
  declarations: [AdminUsersPage, AdminUserCreatePage],
})
export class AdminUsersPageModule {}
