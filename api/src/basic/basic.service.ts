import { Injectable,  Logger } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { JourneyBasicEntity } from './entities/journey.basic.entity';
import { StopBasicEntity } from './entities/stop.basic.entity';
import { ArrivalBasicEntity } from './entities/arrival.basic.entity';
import { TimetableBasicEntity } from './entities/timetable.basic.entity';
import { Repository } from 'typeorm';
import { JourneyBasicAddElementDto } from './dto/journey_basic_add_element_dto';
import { StopBasicAddElementDto } from './dto/stop_basic_add_element_dto';
import { ArrivalBasicAddElementDto } from './dto/arrival_basic_add_element_dto';
import { ArrivalBasicModifyElementDto } from './dto/arrival_basic_modify_element_dto';
import { TimetableBasicAddElementDto } from './dto/timetable.basic.add.element.dto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DailyService } from './interfaces/daily.service.interface';
@Injectable()
export class BasicService {
  private readonly logger = new Logger(BasicService.name);

  private is_deleting: string[] = ["0"]
  private is_validating: string[] = ["0"]
  constructor(
    @InjectRepository(JourneyBasicEntity, 'live')
    private journeyBasicRepository: Repository<JourneyBasicEntity>,

    @InjectRepository(StopBasicEntity, 'live')
    private stopBasicRepository: Repository<StopBasicEntity>,

    @InjectRepository(ArrivalBasicEntity, 'live')
    private arrivalBasicRepository: Repository<ArrivalBasicEntity>,

    @InjectRepository(TimetableBasicEntity, 'live')
    private timetableBasicRepository: Repository<TimetableBasicEntity>,

    @InjectDataSource('live') 
    private liveDataSource: DataSource

  ) {}  
  
  public set_deleting(): void{
    this.is_deleting = ["1"]
  }

  public failed_deleting(): void{
    this.is_deleting = ["2"]
  }

  public succeeded_deleting(): void{
    this.is_deleting = ["0"]
  }

  public check_deleting(): string[]{
    return this.is_deleting
  }

  public set_validating(): void{
    this.is_validating = ["1"]
  }

  public failed_validating(): void{
    this.is_validating = ["2"]
  }

  public succeeded_validating(): void{
    this.is_validating = ["0"]
  }

  public check_validating(): string[]{
    return this.is_validating
  }

  async setBasicJourneysInactive(): Promise<void>{
    await this.createJourneysBasicTable()
    await this.journeyBasicRepository
      .createQueryBuilder()
      .update(JourneyBasicEntity)
      .set({ is_active: 0 })
      .where('is_active = :is_active', { is_active: 2 })
      .execute();
  }

  async flagBasicJourneysInactive(): Promise<void>{
    await this.createJourneysBasicTable()
    await this.journeyBasicRepository
      .createQueryBuilder()
      .update(JourneyBasicEntity)
      .set({ is_active: 2 })
      .where('is_active = :is_active', { is_active: 1 })
      .execute();
  }

  async restoreBasicJourneysInactive(): Promise<void>{
    await this.createJourneysBasicTable()
    await this.journeyBasicRepository
      .createQueryBuilder()
      .update(JourneyBasicEntity)
      .set({ is_active: 0 })
      .where('is_active = :is_active', { is_active: 1 })
      .execute();
    await this.journeyBasicRepository
      .createQueryBuilder()
      .update(JourneyBasicEntity)
      .set({ is_active: 1 })
      .where('is_active = :is_active', { is_active: 2 })
      .execute();
  }

  async createJourneysBasicTable(): Promise<void>{
    const queryRunner = this.liveDataSource.createQueryRunner();
    await queryRunner.connect();

    try{
      const stopsTableExists = await queryRunner.hasTable('journeys_basic');
      if (!stopsTableExists) {
        await queryRunner.startTransaction();
        
        this.logger.log('Creating journeys_basic table in database Live...');
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "journeys_basic" (
            "Index"	INTEGER,
            "service"	TEXT NOT NULL,
            "route_section_name"	TEXT NOT NULL,
            "direction"	TEXT NOT NULL,
            "origin"	TEXT NOT NULL,
            "destination"	TEXT NOT NULL,
            "valid_from"	INTEGER NOT NULL,
            "valid_to"	INTEGER NOT NULL,
            "stop_list"	TEXT,
            "date_added"	INTEGER NOT NULL,
            "date_modified"	INTEGER NOT NULL,
            "entry_created_at"	INTEGER NOT NULL,
            "is_active"	INTEGER NOT NULL,
            "origin_id"	TEXT NOT NULL,
            "destination_id"	TEXT NOT NULL,
            "validated"	INTEGER NOT NULL,
            "route_section_id"	TEXT NOT NULL,
            "count"	INTEGER NOT NULL,
            PRIMARY KEY("Index" AUTOINCREMENT),
            UNIQUE("route_section_name","origin_id","destination_id","service","date_modified","count")
          );
        `);

        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_cover_active_valid
          ON journeys_basic (valid_to, valid_from, service, origin_id, destination_id, count) 
          WHERE is_active = 1;
        `);

        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_update_filter
          ON journeys_basic (service, origin_id, destination_id, date_modified, count);
        `);        

        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_entry_created_at ON journeys_basic (entry_created_at);
        `);  

        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_journeys_basic_stop_list_index ON journeys_basic (stop_list, "Index");
        `);  

        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_jb_join_order_cover 
          ON journeys_basic (service, origin_id, destination_id, date_modified, count, "Index", stop_list);
        `);  

        await queryRunner.commitTransaction();
        this.logger.log('journeys_basic table created successfully');  
      }
    } catch (error) {
      console.error('❌ journeys_basic table creation failed:', error);
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      this.logger.log('releasing queryRunner');
      await queryRunner.release();
    }
  }

  async createStopsBasicTable() : Promise<void>{
    const queryRunner = this.liveDataSource.createQueryRunner();
    await queryRunner.connect();

    try{
      const stopsTableExists = await queryRunner.hasTable('stops_basic');
      if (!stopsTableExists) {
        await queryRunner.startTransaction();

        this.logger.log('Creating stops_basic table in database Live...');
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "stops_basic" (
            "ATCOCode"	TEXT NOT NULL,
            "CommonName"	TEXT NOT NULL,
            "Longitude"	REAL NOT NULL,
            "Latitude"	REAL NOT NULL,
            "ModificationDateTime"	INTEGER NOT NULL,
            "Index"	INTEGER NOT NULL,
            UNIQUE("ATCOCode","CommonName","Longitude","Latitude","ModificationDateTime"),
            PRIMARY KEY("Index" AUTOINCREMENT)
          );
        `);    

        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_stops_basic_modification_time 
          ON stops_basic(ModificationDateTime);
        `);

        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_stops_basic_atcocode ON stops_basic(ATCOCode);
        `);

        await queryRunner.commitTransaction();
        this.logger.log('stops_basic table created successfully');  
      }
    } catch (error) {
      console.error('❌ stops_basic table creation failed', error);
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      console.log('releasing queryRunner');
      await queryRunner.release();
    } 

  }

  async createArrivalsBasicTable(): Promise<void>{
    const queryRunner = this.liveDataSource.createQueryRunner();
    await queryRunner.connect();

    try{
      const stopsTableExists = await queryRunner.hasTable('arrivals_basic');
      if (!stopsTableExists) {
        await queryRunner.startTransaction();

        this.logger.log('Creating arrivals_basic table in database Live...');
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "arrivals_basic" (
            "service"	TEXT NOT NULL,
            "origin"	TEXT NOT NULL,
            "index"	INTEGER,
            "destination"	TEXT NOT NULL,
            "date_added"	TEXT NOT NULL,
            "stop_id"	TEXT NOT NULL,
            "time"	INTEGER NOT NULL,
            "date"	TEXT NOT NULL,
            "bus_id"	INTEGER NOT NULL,
            "count"	INTEGER NOT NULL,
            "valid"	INTEGER,
            PRIMARY KEY("index" AUTOINCREMENT),
            UNIQUE("service","origin","destination","time","date","bus_id","stop_id","count")
          );
        `);

        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_arrivals_basic_delete_filter 
          ON arrivals_basic (service, origin, destination, bus_id, count, valid);
        `);

        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_arrivals_basic_date_added ON arrivals_basic (date_added);
        `);

        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_arrivals_basic_valid_index ON arrivals_basic (valid, "index");
        `);
        
        await queryRunner.commitTransaction();
        this.logger.log('arrival_basic table created successfully');
      }  
    } catch (error) {
      console.error('arrival_basic table creation failed:', error);
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      this.logger.log('releasing queryRunner');
      await queryRunner.release();
    }

  }

  async createTimetablesBasicTable(): Promise<void>{
    const queryRunner = this.liveDataSource.createQueryRunner();
    await queryRunner.connect();
    try{
      const stopsTableExists = await queryRunner.hasTable('timetables_basic');
      if (!stopsTableExists) {
        await queryRunner.startTransaction();
        this.logger.log('Creating timetables_basic table in database Live...');
        await queryRunner.query(`
          CREATE TABLE "timetables_basic" (
            "index"	INTEGER NOT NULL,
            "origin_id"	TEXT NOT NULL,
            "destination_id"	TEXT NOT NULL,
            "name"	TEXT NOT NULL,
            "service"	TEXT NOT NULL,
            "stop_id"	TEXT NOT NULL,
            "time"	INTEGER NOT NULL,
            "created_at"	DATETIME DEFAULT 'DEFAULT CURRENT_TIMESTAMP',
            "is_active"	INTEGER NOT NULL,
            "count"	INTEGER NOT NULL,
            PRIMARY KEY("index" AUTOINCREMENT),
            UNIQUE("origin_id","destination_id","name","service","stop_id","time","created_at","count")
          )
        `);

        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_timetables_basic_created_at ON timetables_basic(created_at);
        `);

        await queryRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_tb_join_filter ON timetables_basic(stop_id, service, origin_id, destination_id, count, name, is_active);
        `);


        

        await queryRunner.commitTransaction();
        this.logger.log('arrival_basic table created successfully');  
      }
    } catch (error) {
      console.error('arrival_basic table creation failed:', error);
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      this.logger.log('releasing queryRunner');
      await queryRunner.release();
    }

  }

  async addNewJourneyBasic(elements: JourneyBasicAddElementDto[]): Promise<void>{
    await this.journeyBasicRepository
      .createQueryBuilder()
      .insert()
      .into(JourneyBasicEntity)
      .values(elements)
      .orIgnore()  // This is key for SQLite
      .execute();
  }

  async addNewStopBasic(elements: StopBasicAddElementDto[]): Promise<void>{
    await this.stopBasicRepository
      .createQueryBuilder()
      .insert()
      .into(StopBasicEntity)
      .values(elements)
      .orIgnore() 
      .execute();
  }

  async addNewArrivalBasic(elements: ArrivalBasicAddElementDto[]): Promise<void>{
    await this.arrivalBasicRepository
      .createQueryBuilder()
      .insert()
      .into(ArrivalBasicEntity)
      .values(elements)
      .orIgnore()  
      .execute();
  }

  async addNewTimetableBasic(elements: TimetableBasicAddElementDto[]): Promise<void>{
    await this.timetableBasicRepository
      .createQueryBuilder()
      .insert()
      .into(TimetableBasicEntity)
      .values(elements)
      .orIgnore()  
      .execute();
  }

  async getValidJourneysBasic(): Promise<JourneyBasicEntity[]>{
    return  await this.journeyBasicRepository.createQueryBuilder('journeys_basic') 
    .where('journeys_basic.valid_to > :greaterThan', { greaterThan: Math.floor(Date.now() / 1000) })
    .andWhere('journeys_basic.valid_from < :lessThan', { lessThan: Math.floor( Date.now() / 1000) })
    .andWhere('journeys_basic.is_active == :equals', { equals: 1 })
    .getMany(); 
  }

  async getActiveJourneysBasic(): Promise<JourneyBasicEntity[]>{
    return  await this.journeyBasicRepository.createQueryBuilder('journeys_basic') 
    .where('journeys_basic.valid_to > :greaterThan', { greaterThan: Math.floor(Date.now() / 1000) })
    .andWhere('journeys_basic.valid_from < :lessThan', { lessThan: Math.floor( Date.now() / 1000) })
    .andWhere('journeys_basic.is_active == :equals', { equals: 1 })
    .getMany(); 
  }

  async setJourneyBasicActive(elements: JourneyBasicAddElementDto[]): Promise<void>{
    if (elements.length === 0) return;

    // Create WHERE conditions dynamically
    const whereConditions = elements.map((element, index) => {
      return new Brackets(qb => {
        qb.where('journeys_basic.service = :service_' + index, { [`service_${index}`]: element.service })
          .andWhere('journeys_basic.origin_id = :origin_id_' + index, { [`origin_id_${index}`]: element.origin_id })
          .andWhere('journeys_basic.destination_id = :destination_id_' + index, { [`destination_id_${index}`]: element.destination_id })
          .andWhere('journeys_basic.date_modified = :date_modified_' + index, { [`date_modified_${index}`]: element.date_modified })
          .andWhere('journeys_basic.count = :count_' + index, { [`count_${index}`]: element.count });
      });
    });

    await this.journeyBasicRepository
      .createQueryBuilder('journeys_basic')
      .update()
      .set({ is_active: 1 }) // Replace 'targetColumn' with your actual column name
      .where(
        new Brackets(mainQb => {
          whereConditions.forEach((condition, index) => {
            if (index === 0) {
              mainQb.where(condition);
            } else {
              mainQb.orWhere(condition);
            }
          });
        }),
      )
      .execute();
  }

  async deleteInvalidArrivalsBasic(): Promise<void>{
    await this.arrivalBasicRepository
      .createQueryBuilder()
      .delete()
      .from(ArrivalBasicEntity)
      .where('valid = :valid', { valid: 0 })
      .execute();
  }

  async deleteMatchingArrivalsBasic(elements: ArrivalBasicModifyElementDto[]): Promise<void>{
    if (elements.length === 0) return;

    // Create WHERE conditions dynamically
    const whereConditions = elements.map((element, index) => {
      return new Brackets(qb => {
        qb.where('arrivals_basic.service = :service_' + index, { [`service_${index}`]: element.service })
          .andWhere('arrivals_basic.origin = :origin_' + index, { [`origin_${index}`]: element.origin })
          .andWhere('arrivals_basic.destination = :destination_' + index, { [`destination_${index}`]: element.destination })
          .andWhere('arrivals_basic.bus_id = :bus_id_' + index, { [`bus_id_${index}`]: element.bus_id })
          .andWhere('arrivals_basic.count = :count_' + index, { [`count_${index}`]: element.count })
          .andWhere('arrivals_basic.valid = :valid' + index, { [`valid${index}`]: 0 })
      });
    });

    await this.arrivalBasicRepository
      .createQueryBuilder('arrivals_basic')
      .delete()
      .where(
        new Brackets(mainQb => {
          whereConditions.forEach((condition, index) => {
            if (index === 0) {
              mainQb.where(condition);
            } else {
              mainQb.orWhere(condition);
            }
          });
        }),
      )
      .execute();
  }

  async setValidMatchingArrivalsBasic(elements: ArrivalBasicModifyElementDto[]): Promise<void>{
    if (elements.length === 0) return;

    // Create WHERE conditions dynamically
    const whereConditions = elements.map((element, index) => {
      return new Brackets(qb => {
        qb.where('arrivals_basic.service = :service_' + index, { [`service_${index}`]: element.service })
          .andWhere('arrivals_basic.origin = :origin_' + index, { [`origin_${index}`]: element.origin })
          .andWhere('arrivals_basic.destination = :destination_' + index, { [`destination_${index}`]: element.destination })
          .andWhere('arrivals_basic.bus_id = :bus_id_' + index, { [`bus_id_${index}`]: element.bus_id })
          .andWhere('arrivals_basic.count = :count_' + index, { [`count_${index}`]: element.count })
          .andWhere('arrivals_basic.valid = :valid' + index, { [`valid${index}`]: 0 })
      });
    });

    await this.arrivalBasicRepository
      .createQueryBuilder('arrivals_basic')
      .update()
      .set({valid : 1})
      .where(
        new Brackets(mainQb => {
          whereConditions.forEach((condition, index) => {
            if (index === 0) {
              mainQb.where(condition);
            } else {
              mainQb.orWhere(condition);
            }
          });
        }),
      )
      .execute();
  }

  async getDailyServices() : Promise<DailyService[]>{
      return  await this.journeyBasicRepository.createQueryBuilder('journeys_basic') 
      .select(['journeys_basic.service', 'journeys_basic.origin_id', 'journeys_basic.destination_id', 'journeys_basic.count'])
      .where('journeys_basic.valid_to > :greaterThan', { greaterThan: Math.floor(Date.now() / 1000) })
      .andWhere('journeys_basic.valid_from < :lessThan', { lessThan: Math.floor( Date.now() / 1000) })
      .andWhere('journeys_basic.is_active == :equals', { equals: 1 })
      .getMany();     
  }

  async deleteOldJourneyBasic(): Promise<void>{
    await this.journeyBasicRepository
      .createQueryBuilder('journeys_basic')
      .delete()
      .where('journeys_basic.entry_created_at < :lessThan', { lessThan: Math.floor(new Date().getTime() / 1000)-(60*60*24*7 - 60*60) })
      .execute();
  }

  async deleteOldStopBasic(): Promise<void>{
    
    await this.stopBasicRepository
      .createQueryBuilder('stops_basic')
      .delete()
      .where('stops_basic.ModificationDateTime < :lessThan', { lessThan: Math.floor(new Date().getTime() / 1000)-(60*60*24*7 - 60*60) })
      .execute();
  }

  async deleteOldTimetableBasic(): Promise<void>{
    this.logger.log('Starting batch TimetableBasic deletion...');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 1);      
    cutoff.setHours(cutoff.getHours() - 23);  
    const cutoff_io = cutoff.toISOString()
    const batchSize = 10000

    let affected = 0;
    try{
      while (true) {
        // Raw SQLite DELETE with LIMIT
        const ids = await this.timetableBasicRepository
          .createQueryBuilder('timetables_basic')
          .select('timetables_basic."index"')
          .where('timetables_basic.created_at < :cutoff', { cutoff })
          .orderBy('timetables_basic."index"')
          .limit(batchSize)
          .getRawMany<{ index: number }>();
        if (ids.length === 0) break;
        const result = await this.timetableBasicRepository.delete(ids.map(item => item.index));
        affected += result.affected ?? 0;
        this.logger.log(`Deleted batch of ${ids.length} rows, total so far: ${affected}`);

      } ;
    } catch (error) {
      console.error('❌ TimetableBasic deletion failed:', error);
      throw error;
    }

  }

  async deleteOldArrivalBasic(): Promise<void>{
    this.logger.log('Starting batch ArrivalBasic deletion...');
    const nowSec = Math.floor(Date.now() / 1000);
    const twoDaysMinusOneHourSec = 60 * 60 * 24 * 2 - 60 * 60; // 169200 seconds = 47 hours
    const cutoff = nowSec - twoDaysMinusOneHourSec;

    const batchSize = 10000

    let affected = 0;
    try{
      while (true){
        const ids = await this.arrivalBasicRepository
          .createQueryBuilder('arrivals_basic')
          .select('arrivals_basic."index"')
          .where('arrivals_basic.date_added < :cutoff', { cutoff })
          .orderBy('arrivals_basic."index"')
          .limit(batchSize)
          .getRawMany<{ index: number }>();
        if (ids.length === 0) break;

        const result = await this.arrivalBasicRepository.delete(ids.map(item => item.index));
        affected += result.affected ?? 0;
        this.logger.log(`Deleted batch of ${ids.length} rows, total so far: ${affected}`);
      };
  } catch (error) {
      console.error('❌ArrivalBasic deletion failed:', error);
      throw error;
    }
  }

  async scrubBasic(): Promise<void>{
    this.logger.log('Clearing all basic tables');
    await this.journeyBasicRepository.clear()
    this.logger.log('JourneysBasic table cleared');
    await this.stopBasicRepository.clear()
    this.logger.log('StopsBasic table cleared');
    await this.arrivalBasicRepository.clear()
    this.logger.log('ArrivalsBasic table cleared');
    await this.timetableBasicRepository.clear()
    this.logger.log('TimetablesBasic table cleared');
    this.logger.log('All basic tables cleared');
  }
}
