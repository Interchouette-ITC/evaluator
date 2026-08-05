import { Injectable } from '@angular/core';
import { MessageResult } from '@evaluator/shared-types';
import { Observable, Subject } from 'rxjs';

@Injectable({
  providedIn: null
})
export class ResultsService {

  private readonly result = new Subject<MessageResult>;

  sendResult(result: MessageResult) {
    this.result.next(result);
  }

  getResult(): Observable<MessageResult> {
    return this.result.asObservable();
  }
}
