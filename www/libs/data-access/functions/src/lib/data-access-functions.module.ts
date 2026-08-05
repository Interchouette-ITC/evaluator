import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FunctionsService } from './functions.service';

@NgModule({
  imports: [CommonModule],
  providers: [FunctionsService],
})
export class DataAccessFunctionsModule {}
