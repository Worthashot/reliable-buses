import { TypeOrmModule } from '@nestjs/typeorm';
import { LogEntity } from './entities/log.entity';
import { ArrivalEntity } from './entities/arrival.entity';
import { JourneyEntity } from 'src/journey/entities/journey.entity';
import { TimetableEntity } from 'src/timetable/entities/timetable.entity';
import { TimetableInformationEntity } from 'src/timetable/entities/timetable_information_entity';
import { StopEntity } from 'src/stop/entities/stop.entity';
import { Module } from '@nestjs/common';
import { LogService } from './log.service';
import { LogController } from './log.controller';

@Module({
imports: [
    TypeOrmModule.forFeature([LogEntity, ArrivalEntity, JourneyEntity, StopEntity, TimetableEntity, TimetableInformationEntity], 
      'live'), 
  ],

    controllers: [LogController],
    providers: [LogService],
})
export class LogModule {}
