import { Module } from '@nestjs/common';
import { RosterModule } from '../roster/roster.module';
import { WeekModule } from '../week/week.module';
import { MeController } from './me.controller';

@Module({
  imports: [RosterModule, WeekModule],
  controllers: [MeController],
})
export class MeModule {}
