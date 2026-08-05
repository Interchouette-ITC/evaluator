import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoggingService } from '../logging.service';

@Component({
  selector: 'evaluator-logging',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './logging.component.html',
  styleUrls: ['./logging.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoggingComponent implements AfterViewInit {
  isOpen!: boolean;

  @ViewChild('textarea') private textarea!: ElementRef;

  constructor(
    private readonly loggingService: LoggingService,
    private readonly changeDetectorRef: ChangeDetectorRef
  ) { }

  ngAfterViewInit(): void {
    this.loggingService.getLog().subscribe((log: string) => {
      const element = this.textarea.nativeElement as HTMLTextAreaElement;
      element.textContent += !element.textContent ? log : '\n\n' + log;
      this.scroll();
      this.changeDetectorRef.markForCheck();
    });
  }

  open() {
    this.isOpen = !this.isOpen;
    setTimeout(() => {
      this.scroll();
    });
  }

  private scroll() {
    const element = this.textarea.nativeElement as HTMLTextAreaElement;
    element.scrollTop = element.scrollHeight;
  }

}
