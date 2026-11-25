import { Module } from '@nestjs/common';
import { PotsController } from './pots.controller.js';
import { PotsService } from './pots.service.js';

@Module({
  controllers: [PotsController],
  providers: [PotsService],
  exports: [PotsService],
})
export class PotsModule {}
