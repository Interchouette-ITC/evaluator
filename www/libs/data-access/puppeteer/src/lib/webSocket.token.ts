import { InjectionToken } from '@angular/core';
import { webSocket } from 'rxjs/webSocket';

export const WEBSOCKET = new InjectionToken<typeof webSocket>(
  'websocket'
);