import { Module } from '@nestjs/common';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogEntity } from 'src/log/entities/log.entity';
import { ArrivalEntity } from 'src/log/entities/arrival.entity';
import { StopEntity } from 'src/stop/entities/stop.entity';
import { JourneyEntity } from 'src/journey/entities/journey.entity';
import { TimetableInformationEntity } from 'src/timetable/entities/timetable_information_entity';
import { TimetableEntity } from 'src/timetable/entities/timetable.entity';
import { ArrivalBasicEntity} from '../basic/entities/arrival.basic.entity';
import { JourneyBasicEntity } from '../basic/entities/journey.basic.entity';
import { StopBasicEntity } from '../basic/entities/stop.basic.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([ArrivalBasicEntity, JourneyBasicEntity, StopBasicEntity,
                                  LogEntity, ArrivalEntity, StopEntity, JourneyEntity, TimetableInformationEntity, TimetableEntity],
                                  'live'),
    ],

    controllers: [MigrationController],
    providers: [MigrationService],
})
export class MigrationModule {}