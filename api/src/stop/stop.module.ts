import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogEntity } from 'src/log/entities/log.entity';
import { ArrivalEntity } from 'src/log/entities/arrival.entity';
import { StopEntity } from 'src/stop/entities/stop.entity';
import { JourneyEntity } from 'src/journey/entities/journey.entity';
import { StopService } from './stop.service';
import { StopController } from './stop.controller';

@Module({
    imports: [
        TypeOrmModule.forFeature([LogEntity, ArrivalEntity, StopEntity, JourneyEntity],
                                  'live'),
    ],

    controllers: [StopController],
    providers: [StopService],
})
export class StopModule {}