import { Inject, Injectable } from '@angular/core';
import PromiseWorker from 'promise-worker';
import { HIGHLIGHT_WEBWORKER_FACTORY } from './util-hihlight-webworker.token';

@Injectable({
  providedIn: null
})
export class HighlightService {

  private webworker?: Worker;
  private hightlightWebworker!: PromiseWorker;

  constructor(@Inject(HIGHLIGHT_WEBWORKER_FACTORY) private readonly highlightWebworkerFactory: () => [Worker, PromiseWorker]) { }

  async highlightMessage<T>(message: T) {
    const hightlight = await this.hightlightWebworker.postMessage<T, T>(message)
      .catch((error) => {
        console.error(error);
        return Promise.resolve(message);
      });
    return hightlight;
  }

  activateWorker() {
    if (this.webworker) { return; }
    const factory = this.highlightWebworkerFactory();
    this.webworker = factory[0] as Worker;
    this.hightlightWebworker = factory[1] as PromiseWorker;
  }

  terminateWorker() {
    if (!this.webworker) { return; }
    this.webworker.terminate();
    delete (this.webworker);
  }
}
