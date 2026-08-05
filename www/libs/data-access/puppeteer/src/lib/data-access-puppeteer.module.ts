import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PuppeteerService } from './puppeteer.service';
import { UtilHihlightWebworkerModule } from '@evaluator/util-hightlight-webworker';
import { WEBSOCKET } from './webSocket.token';
import { webSocket } from 'rxjs/webSocket';


const webSocketProvider = {
  provide: WEBSOCKET,
  useValue: webSocket
};

@NgModule({
  imports: [CommonModule, UtilHihlightWebworkerModule],
  providers: [PuppeteerService, webSocketProvider]
})
export class DataAccessPuppeteerModule { }
