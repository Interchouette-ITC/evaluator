import { Controller, Get, Inject } from '@nestjs/common';
import { FunctionsService } from './functions.service';

@Controller('functions')
export class FunctionsController {

  constructor(
    @Inject(FunctionsService) private readonly functionsService: FunctionsService
  ) { }

  @Get()
  findAll() {
    return this.functionsService.findAll();
  }
}
