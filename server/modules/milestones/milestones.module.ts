import { Module } from '@nestjs/common';
import { MilestonesController } from './milestones.controller';
import { MilestonesService } from './milestones.service';
import { CommentsModule } from '../comments/comments.module';
import { CommitmentsModule } from '../commitments/commitments.module';
import { RosterModule } from '../roster/roster.module';
import { RatingsModule } from '../ratings/ratings.module';
import { WeekModule } from '../week/week.module';

@Module({
  imports: [CommentsModule, CommitmentsModule, RosterModule, RatingsModule, WeekModule],
  controllers: [MilestonesController],
  providers: [MilestonesService],
  exports: [MilestonesService],
})
export class MilestonesModule {}
