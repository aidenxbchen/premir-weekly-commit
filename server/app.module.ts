import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { RosterModule } from './modules/roster/roster.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { WeekModule } from './modules/week/week.module';
import { MeModule } from './modules/me/me.module';
import { CommitmentsModule } from './modules/commitments/commitments.module';
import { MilestonesModule } from './modules/milestones/milestones.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { GradingModule } from './modules/grading/grading.module';
import { BackupModule } from './modules/backup/backup.module';
import { WeeklyBPlusModule } from './modules/weekly-b-plus/weekly-b-plus.module';
import { CommentsModule } from './modules/comments/comments.module';
import { DocTitleModule } from './modules/doc-title/doc-title.module';
import { PersonalVisionModule } from './modules/personal-vision/personal-vision.module';

@Module({
  imports: [
    // 平台 Module，提供平台能力
    PlatformModule.forRoot(),
    // ====== @route-section: business-modules START ======
    RosterModule,
    DepartmentsModule,
    WeekModule,
    MeModule,
    CommitmentsModule,
    MilestonesModule,
    RatingsModule,
    WeeklyBPlusModule,
    CommentsModule,
    DocTitleModule,
    PersonalVisionModule,
    GradingModule,
    BackupModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
