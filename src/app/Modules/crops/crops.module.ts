import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';

import { CropCreatePage } from './crop-create.page';
import { CropsPage } from './crops.page';

const routes: Routes = [
  { path: '', component: CropsPage },
  { path: 'new', component: CropCreatePage },
  { path: ':id/edit', component: CropCreatePage },
];

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonicModule,
    RouterModule.forChild(routes),
  ],
  declarations: [CropsPage, CropCreatePage],
})
export class CropsPageModule {}
