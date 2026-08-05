import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { SearchBarComponent } from '@evaluator/feature-search-bar';
import { ResultsComponent } from '@evaluator/feature/results';
import { DataAccessPuppeteerModule, PuppeteerService } from '@evaluator/data-access-puppeteer';
import { Subscription } from 'rxjs';
import { Message, MessageResult } from '@evaluator/shared-types';
import { ResultsService } from '@evaluator/shared-services';
import { LoggingComponent } from '@evaluator/logging';
import { LoggingService } from 'libs/feature/logging/src/lib/logging.service';


@Component({
  selector: 'evaluator-feature-home',
  standalone: true,
  imports: [CommonModule, SearchBarComponent, ResultsComponent, DataAccessPuppeteerModule, LoggingComponent],
  providers: [ResultsService, LoggingService],
  templateUrl: './feature-home.component.html',
  styleUrls: ['./feature-home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnDestroy, OnInit {
  url!: string;
  fn!: string;
  fnAsString!: string;
  hasResponse!: boolean;
  screenshot!: string;

  private window: Window;
  private getMessageSubscription?: Subscription;

  constructor(
    private readonly puppeteerService: PuppeteerService,
    private readonly resultsService: ResultsService,
    private readonly changeDetectorRef: ChangeDetectorRef,
    @Inject(DOCUMENT) private readonly document: Document,
    private readonly loggingService: LoggingService
  ) {
    this.window = this.document.defaultView as Window;

  }

  ngOnInit() {
    this.window?.localStorage && (this.fn = this.window.localStorage.getItem('evaluator.fn') || '');
    this.window?.localStorage && (this.fnAsString = this.window.localStorage.getItem('evaluator.fnAsString') || '');
  }

  private sendResults() {
    this.getMessageSubscription = this.puppeteerService.getMessage().subscribe(async (message: Promise<MessageResult | boolean | string>) => {
      const result = await message;
      if (!result) {
        this.hasResponse = true;
        // this.puppeteerService.terminateWorker();
      }
      else if (result && typeof result === 'string') {
        result.includes('data:image') ? (this.screenshot = result) : this.loggingService.sendLog(result);
      } else {
        this.resultsService.sendResult(result as MessageResult);
      }
      this.changeDetectorRef.markForCheck();
    });
  }

  send(message: Message) {
    this.hasResponse = false;
    this.url = message.url;
    this.fn = message.fn;
    this.screenshot = '';
    this.puppeteerService.sendMessage(message);
    this.sendResults();
    this.window?.localStorage && this.window.localStorage.setItem('evaluator.fn', this.fn);
  }

  setFn(fnAsString: string) {
    this.hasResponse = false;
    this.url = '';
    this.fnAsString = fnAsString;
    this.window?.localStorage && this.window.localStorage.setItem('evaluator.fnAsString', this.fnAsString);
  }

  ngOnDestroy(): void {
    this.getMessageSubscription && this.getMessageSubscription.unsubscribe();
  }
}
