import { Module } from '@nestjs/common';
import { GradingController } from './grading.controller';
import { GradingService } from './grading.service';
import { MilestonesModule } from '../milestones/milestones.module';
import { CommitmentsModule } from '../commitments/commitments.module';
import { RatingsModule } from '../ratings/ratings.module';
import { RosterModule } from '../roster/roster.module';

@Module({
  imports: [MilestonesModule, CommitmentsModule, RatingsModule, RosterModule],
  controllers: [GradingController],
  providers: [GradingService],
})
export class GradingModule {}
