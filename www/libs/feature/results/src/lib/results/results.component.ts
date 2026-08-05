import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, HostBinding, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DataAccessFunctionsModule } from '@evaluator/data-accesss-functions';
import { ResultsService } from '@evaluator/shared-services';
import { MessageResult } from '@evaluator/shared-types';
// import { fadeInOut } from './fadeInOut';

@Component({
  selector: 'evaluator-results',
  standalone: true,
  templateUrl: './results.component.html',
  styleUrls: ['./results.component.scss'],
  // animations: [
  //   fadeInOut
  // ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DataAccessFunctionsModule, FormsModule],
})
export class ResultsComponent implements AfterViewInit {
  @Input() set hasResponse(hasResponse: boolean) {
    if (!hasResponse) {
      this.results = [];
      this.openStackTraces = [];
      this.isOpenScreenshot = false;
      this.screenshot = '';
    }
    this._hasResponse = hasResponse;
  }
  get hasResponse() {
    return this._hasResponse;
  }
  @Input()
  set url(value: string) {
    this._url = value;
  }
  get url() {
    return this._url;
  }
  @Input() fnAsString!: string;
  @Input() screenshot!: string;
  @HostBinding('class.filled') get result() { return this.url && this.results.length; }

  results: MessageResult[] = [];
  openStackTraces: boolean[] = [];
  showBeautifies: boolean[] = [];
  isOpenScreenshot!: boolean;

  private _url = '';
  private _hasResponse!: boolean;

  constructor(
    private readonly resultsService: ResultsService,
    private readonly changeDetectorRef: ChangeDetectorRef
  ) { }

  ngAfterViewInit() {
    this.resultsService.getResult().subscribe((result: MessageResult) => {
      if (result) {
        this.results.push(result);
        this.changeDetectorRef.markForCheck();
      }
    });
  }

  openStackTrace(event: Event, index: number): void {
    event.preventDefault();
    this.openStackTraces[index] = !this.openStackTraces[index];
  };

  isOpenStackTrace(index: number): boolean {
    return this.openStackTraces[index];
  }

  showBeautify(event: Event, index: number): void {
    event.preventDefault();
    this.showBeautifies[index] = !this.showBeautifies[index];
  };

  isBeautified(index: number): boolean {
    return this.showBeautifies[index];
  }

}
