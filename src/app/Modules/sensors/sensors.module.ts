import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';

import { SensorCropPage } from './sensor-crop.page';
import { SensorsPage } from './sensors.page';

const routes: Routes = [
  { path: '', component: SensorsPage },
  { path: 'new', component: SensorCropPage },
  { path: ':id/edit', component: SensorCropPage },
];

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonicModule,
    RouterModule.forChild(routes),
  ],
  declarations: [SensorsPage, SensorCropPage],
})
export class SensorsPageModule {}
