import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';

import { SensorDetailPage } from './sensor-detail.page';

const routes: Routes = [{ path: '', component: SensorDetailPage }];

@NgModule({
  imports: [CommonModule, IonicModule, RouterModule.forChild(routes)],
  declarations: [SensorDetailPage],
})
export class SensorDetailPageModule {}
