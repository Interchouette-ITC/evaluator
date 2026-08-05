import { Module } from '@nestjs/common';
import { FunctionsController } from '../functions/functions.controller';
import { FunctionsService } from '../functions/functions.service';
import { resolveFunctionsPath } from '@evaluator-backend/util-functions';
import { UtilFunctionsService } from '@evaluator-backend/util-functions/nest';

import { AppController } from './app.controller';

@Module({
  imports: [],
  controllers: [AppController, FunctionsController],
  providers: [
    FunctionsService,
    UtilFunctionsService,
    {
      provide: 'FUNCTIONS_PATH',
      useFactory: () => resolveFunctionsPath(),
    },
  ],
})
export class AppModule {}
