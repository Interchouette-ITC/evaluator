import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Inject, InjectionToken, Input, OnDestroy, OnInit, Output, PLATFORM_ID, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DataAccessFunctionsModule, FunctionsService } from '@evaluator/data-accesss-functions';
import { Functions, Message } from '@evaluator/shared-types';
import { InputComponent } from 'libs/ui/input/src/lib/input/input.component';
import { Subscription } from 'rxjs';

/** Demo page that exercises `eval` in-browser (W3Schools Tryit). */
export const DEFAULT_EVAL_URL =
  'https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval';

@Component({
  selector: 'evaluator-search-bar',
  standalone: true,
  templateUrl: './search-bar.component.html',
  styleUrls: ['./search-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DataAccessFunctionsModule, FormsModule, InputComponent],
})
export class SearchBarComponent implements OnInit, OnDestroy {
  @Output() send = new EventEmitter<Message>;
  @Output() setFn = new EventEmitter<string>();
  @Input() disabled!: boolean;
  @Input() fn!: string;
  @ViewChild('select') private select!: ElementRef;

  url = DEFAULT_EVAL_URL;
  isValid = true;
  functions: Functions = {};
  functionsKeys?: string[];
  private _url_value = ''; // memoize value to compare
  private _fn_value = ''; // memoize value to compare
  private functionsServiceSubscription?: Subscription;
  private isBrowser: boolean = isPlatformBrowser(this.platformId);

  constructor(
    @Inject(PLATFORM_ID) private readonly platformId: InjectionToken<object>,
    private readonly functionsService: FunctionsService,
    private readonly changeDetectorRef: ChangeDetectorRef
  ) { }

  ngOnInit() {
    if (!this.isBrowser) {
      return;
    }
    this.functionsServiceSubscription = this.functionsService.get().subscribe((functions) => {
      if (!functions) {
        return;
      }
      this.functionsKeys = Object.keys(functions);
      this.functions = functions;
      this.changeDetectorRef.markForCheck();
    });
  }

  ngOnDestroy() {
    if (this.functionsServiceSubscription) {
      this.functionsServiceSubscription.unsubscribe();
    }
  }

  onSend(url: string, fn: string) {
    if ((url === this._url_value) && (fn === this._fn_value)) {
      return;
    }
    if (this.isValid && url) {
      this.send.emit({
        url,
        fn
      });
      this._fn_value = fn;
      this._url_value = url;
    }
  }

  onFnChange(event: Event) {
    const element = event.target as HTMLSelectElement;
    this.fn = element.value as string;
    const fnAsString = element.options[element.options.selectedIndex].text;
    fnAsString && this.setFn.emit(fnAsString);
  }

  reset() {
    this.url = '';
    this.fn = '';
    setTimeout(() => {
      const element = this.select.nativeElement as HTMLSelectElement;
      const fnAsString = element.options[element.options.selectedIndex].text;
      console.log(fnAsString);
      this.setFn.emit(fnAsString);
    });

  }

}
