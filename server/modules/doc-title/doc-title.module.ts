import { Module } from '@nestjs/common';
import { DocTitleController } from './doc-title.controller';
import { DocTitleService } from './doc-title.service';

@Module({
  controllers: [DocTitleController],
  providers: [DocTitleService],
  exports: [DocTitleService],
})
export class DocTitleModule {}
