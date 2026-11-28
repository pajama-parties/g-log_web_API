import { Module } from '@nestjs/common';
import { PotRangeController } from './pot-range.controller.js';
import { PotRangeService } from './pot-range.service.js';

@Module({
  controllers: [PotRangeController],
  providers: [PotRangeService],
})
export class PotRangeModule {}
