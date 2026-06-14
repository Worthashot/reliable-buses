//The idea of this is to provide services that create the basic database tables
//for basic_journeys, will add all historical journeys, matching the unique columns
//Then, the usual scan for new journeys happens
//Then, the number of repeated unique columns are counted, and a valid count is created
//Finaly, all entries outside the date are discarded from the basic table.

//This allows the count to match between the live database, and the basic.

import { BasicController } from './basic.controller';
import { BasicService } from './basic.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { JourneyBasicEntity } from './entities/journey.basic.entity';
import { JourneyEntity } from 'src/journey/entities/journey.entity';
import { StopBasicEntity } from './entities/stop.basic.entity';
import { ArrivalBasicEntity } from './entities/arrival.basic.entity';
import { TimetableBasicEntity } from './entities/timetable.basic.entity';
import { MigrationService } from 'src/migration/migration.service';
@Module({
imports: [
    TypeOrmModule.forFeature([JourneyEntity,
                            JourneyBasicEntity, StopBasicEntity, ArrivalBasicEntity, TimetableBasicEntity], 
                            'live'), // Register entity for this module
  ],

    controllers: [BasicController],
    providers: [BasicService],
})
export class BasicModule {}