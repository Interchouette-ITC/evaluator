import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Routes } from '@angular/router';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

const ROUTES: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('@evaluator/feature-home').then((m) => m.FEATUREHOME_ROUTES),
  },
];

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    provideAnimations(),
    provideRouter(ROUTES),
  ],
}).catch((err) => console.error(err));
