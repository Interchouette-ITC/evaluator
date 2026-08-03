import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, Inject, InjectionToken, PLATFORM_ID } from '@angular/core';
import { RouterModule } from '@angular/router';

const imports = [
  CommonModule,
  RouterModule,
];
@Component({
  selector: 'evaluator-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports,
})
export class AppComponent {
  private window!: Window;
  private isBrowser: boolean = isPlatformBrowser(this.platformId);
  mail = 'Y29udGFjdEBpbnRlcmNob3VldHRlLm5ldA==';

  constructor(
    @Inject(PLATFORM_ID) private readonly platformId: InjectionToken<object>,
    @Inject(DOCUMENT) private readonly document: Document) {
    this.window = this.document.defaultView as Window;
  }

  atob(value: string) {
    return this.isBrowser && this.window?.atob(value);
  }
}
