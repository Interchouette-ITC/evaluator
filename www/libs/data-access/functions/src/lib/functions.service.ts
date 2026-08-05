import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Functions } from '@evaluator/shared-types';

@Injectable({
  providedIn: null
})
export class FunctionsService {

  private readonly prefix = '/api/';
  private interface = 'functions';

  constructor(private readonly http: HttpClient) { }

  get(): Observable<Functions> {
    return this.http.get<Functions>(`${this.prefix}${this.interface}`);
  }
}
