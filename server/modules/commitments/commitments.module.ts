import { Module } from '@nestjs/common';
import { CommitmentsController } from './commitments.controller';
import { CommitmentsService } from './commitments.service';
import { CommentsModule } from '../comments/comments.module';
import { RosterModule } from '../roster/roster.module';
import { FeishuTaskModule } from '../feishu-task/feishu-task.module';
import { RatingsModule } from '../ratings/ratings.module';
import { WeekModule } from '../week/week.module';

@Module({
  imports: [CommentsModule, RosterModule, FeishuTaskModule, RatingsModule, WeekModule],
  controllers: [CommitmentsController],
  providers: [CommitmentsService],
  exports: [CommitmentsService],
})
export class CommitmentsModule {}
