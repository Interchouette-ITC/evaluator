import { Inject, Injectable } from '@nestjs/common';
import { UtilFunctionsService } from '@evaluator-backend/util-functions';

@Injectable()
export class FunctionsService {
  constructor(
    @Inject(UtilFunctionsService)
    private readonly utilFunctionsService: UtilFunctionsService
  ) {}

  findAll() {
    return this.utilFunctionsService.getFunctions();
  }
}
