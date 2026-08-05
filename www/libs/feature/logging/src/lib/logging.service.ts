import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

@Injectable({
  providedIn: null
})
export class LoggingService {

  private readonly result = new Subject<string>;

  sendLog(result: string) {
    this.result.next(result);
  }

  getLog(): Observable<string> {
    return this.result.asObservable();
  }
}
