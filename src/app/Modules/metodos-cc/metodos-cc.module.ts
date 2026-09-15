import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';

import { MetodoCCEstimatePage } from './metodo-cc-estimate.page';

const routes: Routes = [
  { path: '', component: MetodoCCEstimatePage },
  { path: ':methodKey/estimate', redirectTo: '', pathMatch: 'full' },
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
  ],
  declarations: [MetodoCCEstimatePage],
})
export class MetodosCCPageModule {}
