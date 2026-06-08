import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ArrivalEntity } from 'src/log/entities/arrival.entity';
import { LogEntity } from 'src/log/entities/log.entity';
import { StopEntity } from 'src/stop/entities/stop.entity';
import { JourneyEntity } from 'src/journey/entities/journey.entity';
import { Repository} from 'typeorm';
import { GetJourneyStopNames } from './interfaces/get.gourney.stop.names';
import { GiveJourneyStopNamesDto } from './dto/give.journey.stop.names.id.dto';

@Injectable()
export class StopService {
  private readonly logger = new Logger(StopService.name);

  constructor(

    @InjectRepository(StopEntity, 'live')
    private stopRepository: Repository<StopEntity>,

    @InjectRepository(JourneyEntity, 'live')
    private journeyRepository: Repository<JourneyEntity>,

    @InjectRepository(ArrivalEntity, 'live')
    private arrivalRepository: Repository<ArrivalEntity>,

    @InjectRepository(LogEntity, 'live')
    private logRepository: Repository<LogEntity>,

  ) {}
  
  async getJourneyStopNames(item : GetJourneyStopNames): Promise<GiveJourneyStopNamesDto[]>{
    const service = item.service
    const direction = item.direction  
    return await this.logRepository
    .createQueryBuilder('log')
    .innerJoin('log.journey', 'journey')
    .innerJoin('log.stop', 'stop')
    .where('journey.service = :service', { service })
    .andWhere('journey.direction = :direction', { direction })
    .select('stop.stop_name', 'stop_name')
    .addSelect('stop.stop_code', 'stop_code')
    .getRawMany();
  }
}