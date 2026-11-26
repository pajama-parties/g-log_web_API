import { Module } from '@nestjs/common';
import { AdvicesController } from './advices.controller.js';
import { AdvicesService } from './advices.service.js';

@Module({
  controllers: [AdvicesController],
  providers: [AdvicesService],
})
export class AdvicesModule {}
