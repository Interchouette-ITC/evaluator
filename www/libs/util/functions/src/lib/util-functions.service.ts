import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Functions } from '@evaluator/shared-types';
import { getFunctionsCatalog } from './functions-catalog-build';

@Injectable()
export class UtilFunctionsService implements OnModuleInit {
  constructor(@Inject('FUNCTIONS_PATH') private readonly path: string) {}

  onModuleInit() {
    // Eager write so Express can resolve sha256 without bundling jsdom.
    this.getFunctions();
  }

  getFunctions(): Functions {
    return getFunctionsCatalog(this.path);
  }
}
