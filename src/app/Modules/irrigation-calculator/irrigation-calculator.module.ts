import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';

import { IrrigationCalculatorPage } from './irrigation-calculator.page';

const routes: Routes = [{ path: '', component: IrrigationCalculatorPage }];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
  ],
  declarations: [IrrigationCalculatorPage],
})
export class IrrigationCalculatorPageModule {}
