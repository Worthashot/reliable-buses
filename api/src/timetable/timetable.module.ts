import { TimetableService } from "./timetable.service";
import { TimetableController } from "./timetable.controller";
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { TimetableEntity } from "./entities/timetable.entity";
@Module({
imports: [
    TypeOrmModule.forFeature([TimetableEntity],
                            'live'), 
  ],

    controllers: [TimetableController],
    providers: [TimetableService],
})
export class BasicModule {}