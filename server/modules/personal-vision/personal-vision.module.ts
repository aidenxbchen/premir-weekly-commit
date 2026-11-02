import { Module } from '@nestjs/common';
import { PersonalVisionController } from './personal-vision.controller';
import { PersonalVisionService } from './personal-vision.service';

@Module({ controllers: [PersonalVisionController], providers: [PersonalVisionService] })
export class PersonalVisionModule {}
