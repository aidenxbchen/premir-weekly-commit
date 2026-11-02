import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CommentNotificationService } from './comment-notification.service';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { RosterModule } from '../roster/roster.module';

@Module({
  imports: [RosterModule, HttpModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentNotificationService],
  exports: [CommentsService],
})
export class CommentsModule {}
