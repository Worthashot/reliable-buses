import { TypeOrmModule } from '@nestjs/typeorm';
import { JourneyEntity } from './entities/journey.entity';
import { Module } from '@nestjs/common';
import { JourneyController } from './journey.controller';
import { JourneyService } from './journey.service';
import { LogEntity } from 'src/log/entities/log.entity';
import { StopEntity } from 'src/stop/entities/stop.entity';
import { ArrivalEntity } from 'src/log/entities/arrival.entity';
@Module({
imports: [
    TypeOrmModule.forFeature([JourneyEntity, LogEntity, StopEntity, ArrivalEntity], 'live'), // Register entity for this module
  ],

    controllers: [JourneyController],
    providers: [JourneyService],
})
export class JourneyModule {}