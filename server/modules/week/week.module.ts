import { Module } from '@nestjs/common';
import { WeekController } from './week.controller';
import { WeekService } from './week.service';

@Module({
  controllers: [WeekController],
  providers: [WeekService],
  exports: [WeekService],
})
export class WeekModule {}
