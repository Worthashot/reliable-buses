import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JourneyEntity } from './entities/journey.entity';
import { JourneyGetTableItemDto } from './dto/journey.get.table.dto';
import { LogEntity } from 'src/log/entities/log.entity';
import { StopEntity } from 'src/stop/entities/stop.entity';
import { ArrivalEntity } from 'src/log/entities/arrival.entity';
import { JourneyArrivalTest } from './interfaces/joureny.arrival';

@Injectable()
export class JourneyService {
  
  private readonly logger = new Logger(JourneyService.name);
  constructor(

    @InjectDataSource('live') 
    private liveDataSource: DataSource,

    @InjectRepository(JourneyEntity, 'live')
    private journeyRepository: Repository<JourneyEntity>,

    @InjectRepository(LogEntity, 'live')
    private logRepository: Repository<LogEntity>,

    @InjectRepository(StopEntity, 'live')
    private stopRepository: Repository<StopEntity>,

    @InjectRepository(ArrivalEntity, 'live')
    private arrivalRepository: Repository<ArrivalEntity>    

  ) {}

  async createjourneysTable(): Promise<void>{
    this.logger.log('Setting up table journeys in database Live');

    const queryRunner = this.liveDataSource.createQueryRunner();
    await queryRunner.connect();

    try{
      await queryRunner.startTransaction();
      const journeysTableExists = await queryRunner.hasTable('journeys');

      if (!journeysTableExists) {
        this.logger.log('Creating journeys table in database Live...');
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS journeys (
            journey_id INTEGER PRIMARY KEY AUTOINCREMENT,
            service VARCHAR NOT NULL,
            origin_name VARCHAR NOT NULL,
            origin_code VARCHAR NOT NULL,
            destination_name VARCHAR NOT NULL,
            destination_code VARCHAR NOT NULL,
            direction VARCHAR NOT NULL,
            valid_from INTEGER NOT NULL,
            valid_to INTEGER NOT NULL,
            date_added INTEGER NOT NULL,
            date_modified INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            count INTEGER NOT NULL,
            "valid"	INTEGER DEFAULT 1,
            UNIQUE(service, origin_code, destination_code, date_modified, count, valid)
          )
        `);


        await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_journeys_join ON journeys (service, origin_code, destination_code, date_modified, count, journey_id);
        `);

        await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_journeys_arrivals ON journeys (service, origin_code, destination_code, count, valid, journey_id);
        `);

        await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_journey_service_direction ON journeys(service, direction, journey_id);
        `);

          this.logger.log('journeys table created successfully');
      } else {
        this.logger.log('journeys table already exists');
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;   
    } finally {
      this.logger.log('releasing queryRunner');
      await queryRunner.release();
    }
  }

  async getTable(): Promise<JourneyGetTableItemDto[]>{
    
    const journeyGetTableDtoPromise = (await this.journeyRepository.find()).map
    (async item =>{
      const stop_list = await this.getStopList(item);
      const stop_string = stop_list.join(",")
      return new JourneyGetTableItemDto(item, stop_string);
    });
  const journeyGetTableDto = await Promise.all(journeyGetTableDtoPromise);
  return journeyGetTableDto
  }

  async fetch_services(): Promise<string[]>{
    return await this.journeyRepository
      .createQueryBuilder('journeys')
      .select('journeys.service', 'service')
      .distinct(true)
      .getRawMany();    
  }


  async getStopList(item: JourneyEntity): Promise<string[]>{
    const journey_id = item.journey_id
    
    const result = await this.journeyRepository
      .createQueryBuilder('journeys')
      .innerJoinAndSelect('journeys.logs', 'logs')
      .innerJoinAndSelect('logs.stop', 'stop')
      .where('journeys.journey_id = :journey_id', { journey_id })
      .orderBy('logs.stop_sequence', 'ASC')
      .select('stop.stop_code', 'stop_code')
      .addSelect('logs.stop_id', 'stop_id')
      .addSelect('logs.stop_sequence', 'stop_sequence')
      .getRawMany();

    // Extract only columnC values, maintaining order
    return result.map(row => row.stop_code);
  }

  async arrival_test(item: JourneyArrivalTest): Promise<string[]>{
    const stop_id = item.stop_id
    const service = item.service
    const direction = item.direction
    const time = item.time

    const arrival_count = (await (this.arrivalRepository
      .createQueryBuilder('s')
      .innerJoin('arrivals.log', 'log')
      .innerJoin('log.journey', 'journey')
      .innerJoin('log.stop', 'stop')
      .where('stop.stop_code = :stop_id', { stop_id })
      .andWhere('journey.service = :service', { service })
      .andWhere('journey.direction = :direction', { direction })
      .andWhere('ABS(arrival.time - :time) <= 300', { time })
      .getMany())).length;

  console.log('got ' + arrival_count);

  const total_count = (await this.arrivalRepository
  .createQueryBuilder('arrivals')
  .select('DISTINCT arrivals.date', 'date')
  .getRawMany()).length;

  console.log('got ' + total_count);

  if ((total_count == 0) || (arrival_count == 0) ){
    return ["0"]
  } else{
    return [((arrival_count/total_count)*100).toString()]
  }

  }

}
    
