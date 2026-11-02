import { Module } from '@nestjs/common';
import { WeeklyBPlusController } from './weekly-b-plus.controller';
import { WeeklyBPlusService } from './weekly-b-plus.service';
import { RosterModule } from '../roster/roster.module';
import { WeekModule } from '../week/week.module';
import { RatingsModule } from '../ratings/ratings.module';

@Module({
  imports: [RosterModule, WeekModule, RatingsModule],
  controllers: [WeeklyBPlusController],
  providers: [WeeklyBPlusService],
  exports: [WeeklyBPlusService],
})
export class WeeklyBPlusModule {}
