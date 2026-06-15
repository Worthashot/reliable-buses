import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import {  DataSource, Repository } from 'typeorm';
import { StopBasic } from '../basic/interfaces/stop.basic.interface';
import { JourneyBasic } from '../basic/interfaces/journey.basic.interface';
import { ArrivalBasic } from '../basic/interfaces/arrival.basic.interface';
import { ArrivalEntity } from 'src/log/entities/arrival.entity';
import { ArrivalBasicEntity } from '../basic/entities/arrival.basic.entity';
import { JourneyBasicEntity } from '../basic/entities/journey.basic.entity';
import { StopBasicEntity } from '../basic/entities/stop.basic.entity';
import { LogEntity } from 'src/log/entities/log.entity';
import { StopEntity } from 'src/stop/entities/stop.entity';
import { JourneyEntity } from 'src/journey/entities/journey.entity';
import { TimetableEntity } from 'src/timetable/entities/timetable.entity';
import { TimetableInformationEntity } from 'src/timetable/entities/timetable_information_entity';
import { Log} from 'src/log/interfaces/log.interface';
import { createHash } from 'crypto';
import { retryOnBusy } from 'src/common/retry.on.busy';
import { TaskStatusService } from 'src/taskstatus/taskstatus.service';
@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    
    @InjectRepository(ArrivalBasicEntity, 'live')
    private arrivalBasicRepository: Repository<ArrivalBasicEntity>,

    @InjectRepository(JourneyBasicEntity, 'live')
    private journeyBasicRepository: Repository<JourneyBasicEntity>,

    @InjectRepository(StopBasicEntity, 'live')
    private stopBasicRepository: Repository<StopBasicEntity>,

    @InjectRepository(LogEntity, 'live')
    private logRepository: Repository<LogEntity>,

    @InjectRepository(TimetableEntity, 'live')
    private timetableRepository: Repository<TimetableEntity>,

    @InjectRepository(TimetableInformationEntity, 'live')
    private timetableInformationRepository: Repository<TimetableInformationEntity>,

    @InjectDataSource('live') 
    private liveDataSource: DataSource
    
  ){}
  async testTimetableMerge(): Promise<void>{
    try {
      await this.createTimetablesInformationTable();
      await this.createTimetableTable();
      await this.performMigrationTimetables();

      
      console.log('✅ Migration completed successfully!');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    } finally {
    }

  }

  async dailyMigration(): Promise<void>{

    try {

      await retryOnBusy(async () => this.createStopsTable());

      await retryOnBusy(async () => this.createjourneysTable());

      await retryOnBusy(async () => this.createLogsTable());

      await retryOnBusy(async () => this.createArrivalsTable());

      await retryOnBusy(async () => this.createTimetablesInformationTable());

      await retryOnBusy(async () => this.createTimetableTable());

      await this.performMigrationStops();

      await this.performMigrationjourneys();

      await this.performPopulationLogJunctions();
      
      await this.performMigrationArrivals();

      await this.performMigrationTimetables();

      await this.countLogTimetables();
    
      this.logger.log('✅ Migration completed successfully!');
    } catch (error) {
      this.logger.error('❌ Migration failed:', error);
      throw error;
    }
  }

  async countLogTimetables(): Promise<void>{
    this.logger.log('coungting log timetables');
  await this.logRepository
    .createQueryBuilder()
    .update(LogEntity)
    .set({
      timetable_count: () =>
        `(SELECT COUNT(*) FROM timetables_information WHERE timetables_information.log_id = logs.log_id)`,
    })
    .execute();


  }

  private computeHash(values: string[]): string {
    const sorted = [...values].sort();                 // 1. sort
    const concatenated = sorted.join('|');             // 2. join with delimiter
    return createHash('sha256').update(concatenated).digest('hex'); // 3. hash
  }

  //TODO
  //double check all patters to ensure runners are always closed
  async createStopsTable(): Promise<void>{
    this.logger.log('checking if table stops exists in database Live');
    const stopsTableExists = await retryOnBusy(async () => {
      const checkTableRunner = this.liveDataSource.createQueryRunner();
      await checkTableRunner.connect()
      try{
        return await checkTableRunner.hasTable('stops');
      } catch (error) {
        this.logger.error('Stop table check failed:', error);
        throw error;   
      } finally {
        await checkTableRunner.release();
      }
    })      

    if (!stopsTableExists) {
    await retryOnBusy(async () => {
      this.logger.log('Creating stops table in database Live...');
      const createTableRunner = this.liveDataSource.createQueryRunner();
      await createTableRunner.connect()
      await createTableRunner.startTransaction()
      try{
        await createTableRunner.query(`
          CREATE TABLE IF NOT EXISTS stops (
            stop_id INTEGER PRIMARY KEY AUTOINCREMENT,
            stop_name VARCHAR NOT NULL,
            stop_code VARCHAR NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            modification_date_time INTEGER NOT NULL,
            "valid"	INTEGER DEFAULT 1,
            UNIQUE(stop_code, modification_date_time)
          )
        `);
      await createTableRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_stops_stop_code_covering ON stops(stop_code, stop_id);
        `);

      await createTableRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_stops_stop_code_valid_stop_id ON stops(stop_code, valid, stop_id);
        `);


        this.logger.log('Stops table created successfully');  
        await createTableRunner.commitTransaction();
      } catch (error) {
        this.logger.error('Stops table create failed:', error);
        await createTableRunner.rollbackTransaction();
        throw error;   
      } finally {
        await createTableRunner.release();
      }
    })         

    } else {
      this.logger.log('Stops table already exists');
    }
  }


  async createjourneysTable(): Promise<void>{
    this.logger.log('checking if table journeys exists in database Live');
    const journeysTableExists = await retryOnBusy(async () => {
      const checkTableRunner = this.liveDataSource.createQueryRunner();
      await checkTableRunner.connect()
      try{
        return await checkTableRunner.hasTable('journeys');
      } catch (error) {
        this.logger.error('Journeys table check failed:', error);
        throw error;   
      } finally {
        await checkTableRunner.release();
      }
    })     

    if (!journeysTableExists) {
    await retryOnBusy(async () => {
      this.logger.log('Creating journeys table in database Live...');
      const createTableRunner = this.liveDataSource.createQueryRunner();
      await createTableRunner.connect()
      await createTableRunner.startTransaction()
      try{
        await createTableRunner.query(`
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


      await createTableRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_journeys_join ON journeys (service, origin_code, destination_code, date_modified, count, journey_id);
      `);

      await createTableRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_journeys_arrivals ON journeys (service, origin_code, destination_code, count, valid, journey_id);
      `);

      await createTableRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_journey_service_direction ON journeys(service, direction, journey_id);
      `);

      this.logger.log('Journeys table created successfully');  
      await createTableRunner.commitTransaction();
      } catch (error) {
        this.logger.error('Journeys table create failed:', error);
        await createTableRunner.rollbackTransaction();
        throw error;   
      } finally {
        await createTableRunner.release();
      }
    })         

    } else {
      this.logger.log('Journeys table already exists');
    }
  }

  
  async createLogsTable(): Promise<void>{

    this.logger.log('checking if table logs exists in database Live');
    const logsTableExists = await retryOnBusy(async () => {
      const checkTableRunner = this.liveDataSource.createQueryRunner();
      await checkTableRunner.connect()
      try{
        return await checkTableRunner.hasTable('logs');
      } catch (error) {
        this.logger.error('Logs table check failed:', error);
        throw error;   
      } finally {
        await checkTableRunner.release();
      }
    })   

    if (!logsTableExists) {
    await retryOnBusy(async () => {
      this.logger.log('Creating stops table in database Live...');
      const createTableRunner = this.liveDataSource.createQueryRunner();
      await createTableRunner.connect()
      await createTableRunner.startTransaction()
      try{
        await createTableRunner.query(`
          CREATE TABLE "logs" (
            "log_id"	INTEGER,
            "stop_sequence"	INTEGER NOT NULL,
            "created_at"	DATETIME DEFAULT CURRENT_TIMESTAMP,
            "updated_at"	DATETIME DEFAULT CURRENT_TIMESTAMP,
            "stop_id"	INTEGER NOT NULL,
            "journey_id"	INTEGER NOT NULL,
            "timetable_count"	INTEGER DEFAULT 0,
            PRIMARY KEY("log_id" AUTOINCREMENT),
            UNIQUE("stop_id","journey_id"),
            FOREIGN KEY("journey_id") REFERENCES "journeys"("journey_id") ON DELETE CASCADE,
            FOREIGN KEY("stop_id") REFERENCES "stops"("stop_id") ON DELETE CASCADE
          )
        `);

      await createTableRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_logs_stop_journey_log ON logs (stop_id, journey_id, log_id);
      `);

      await createTableRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_logs_journey_stop_log ON logs (journey_id, stop_id, log_id);
      `);

      await createTableRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_log_journey_id_stop_sequence ON logs(journey_id, stop_sequence);
      `);

        this.logger.log('Logs table created successfully');  
        await createTableRunner.commitTransaction();
      } catch (error) {
        this.logger.error('Logs table create failed:', error);
        await createTableRunner.rollbackTransaction();
        throw error;   
      } finally {
        await createTableRunner.release();
      }
    })  
    } else {
      this.logger.log('Logs table already exists');
    } 
  }

  async createArrivalsTable(): Promise<void>{
    this.logger.log('checking if table arrivals exists in database Live');
    const arrivalsTableExists = await retryOnBusy(async () => {
      const checkTableRunner = this.liveDataSource.createQueryRunner();
      await checkTableRunner.connect()
      try{
        return await checkTableRunner.hasTable('arrivals');
      } catch (error) {
        this.logger.error('Arrivals table check failed:', error);
        throw error;   
      } finally {
        await checkTableRunner.release();
      }
    })     

    if (!arrivalsTableExists) {
    await retryOnBusy(async () => {
      this.logger.log('Creating arrivals table in database Live...');
      const createTableRunner = this.liveDataSource.createQueryRunner();
      await createTableRunner.connect()
      await createTableRunner.startTransaction()
      try{
        await createTableRunner.query(`
          CREATE TABLE arrivals (
            arrival_id INTEGER PRIMARY KEY AUTOINCREMENT,
            trip_code INTEGER NOT NULL,
            date INTEGER NOT NULL,
            time INTEGER NOT NULL,
            log_id INTEGER NOT NULL,
            FOREIGN KEY (log_id) REFERENCES logs(log_id)
            UNIQUE(trip_code, date, time, log_id)
          )
        `);

        await createTableRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_arrival_log_id ON arrivals(log_id);
        `);

        await createTableRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_arrival_time ON arrivals(time);
        `);
        this.logger.log('Arrivals table created successfully');  
        await createTableRunner.commitTransaction();
      } catch (error) {
        this.logger.error('Arrivals table create failed:', error);
        await createTableRunner.rollbackTransaction();
        throw error;   
      } finally {
        await createTableRunner.release();
      }
    })   
    } else {
      this.logger.log('Arrivals table already exists');
    }
  }


  async createTimetablesInformationTable(): Promise<void>{
    this.logger.log('checking if table timetables_information exists in database Live');
    const timetablesInformationTableExists = await retryOnBusy(async () => {
      const checkTableRunner = this.liveDataSource.createQueryRunner();
      await checkTableRunner.connect()
      try{
        return await checkTableRunner.hasTable('timetables_information');
      } catch (error) {
        this.logger.error('Timetables_information table check failed:', error);
        throw error;   
      } finally {
        await checkTableRunner.release();
      }
    })     

    if (!timetablesInformationTableExists) {
    await retryOnBusy(async () => {
      this.logger.log('Creating timetables_information table in database Live...');
      const createTableRunner = this.liveDataSource.createQueryRunner();
      await createTableRunner.connect()
      await createTableRunner.startTransaction()
      try{    
        await createTableRunner.query(`
          CREATE TABLE "timetables_information" (
            "timetable_information_id"	INTEGER NOT NULL,
            "log_id"	INTEGER,
            "date_valid_on"	DATETIME DEFAULT 'DEFAULT CURRENT_TIMESTAMP',
            "daily_times_count"	INTEGER DEFAULT 0,
            "day"	TEXT,
            "values_hash"	TEXT,
            UNIQUE("log_id","day","values_hash"),
            PRIMARY KEY("timetable_information_id" AUTOINCREMENT),
            FOREIGN KEY("log_id") REFERENCES "logs"("log_id") ON DELETE CASCADE
          )
        `);

        await createTableRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_timetables_log_id ON timetables_information(log_id);
        `);

        await createTableRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_timetables_log_day_date 
        ON timetables_information (log_id, day, date_valid_on);
        `);
        this.logger.log('Timetables_information table created successfully');  
        await createTableRunner.commitTransaction();
      } catch (error) {
        this.logger.error('Timetables_information table create failed:', error);
        await createTableRunner.rollbackTransaction();
        throw error;   
      } finally {
        await createTableRunner.release();
      }
    })         

    } else {
      this.logger.log('Timetables_information table already exists');
    }
  }        

  async createTimetableTable(): Promise<void>{

    this.logger.log('checking if table timetables exists in database Live');
    const timetablesTableExists = await retryOnBusy(async () => {
      const checkTableRunner = this.liveDataSource.createQueryRunner();
      await checkTableRunner.connect()
      try{
        return await checkTableRunner.hasTable('stops');
      } catch (error) {
        this.logger.error('Timetables table check failed:', error);
        throw error;   
      } finally {
        await checkTableRunner.release();
      }
    })   

    if (!timetablesTableExists) {
    await retryOnBusy(async () => {
      this.logger.log('Creating timetables table in database Live...');
      const createTableRunner = this.liveDataSource.createQueryRunner();
      await createTableRunner.connect()
      await createTableRunner.startTransaction()
      try{
        await createTableRunner.query(`
          CREATE TABLE "timetables" (
            "timetable_id"	INTEGER NOT NULL,
            "time"	TEXT NOT NULL,
            "timetable_information_id"	INTEGER,
            PRIMARY KEY("timetable_id" AUTOINCREMENT),
            UNIQUE("timetable_information_id","time"),
            FOREIGN KEY("timetable_information_id") REFERENCES "timetables_information"("timetable_information_id") ON DELETE CASCADE
          )
        `);
        this.logger.log('Timetables table created successfully');  
        await createTableRunner.commitTransaction();
      } catch (error) {
        this.logger.error('Timetables table create failed:', error);
        await createTableRunner.rollbackTransaction();
        throw error;   
      } finally {
        await createTableRunner.release();
      }
    })         

    } else {
      this.logger.log('Timetables table already exists');
    }
  }
  
  async performMigrationStops(): Promise<void>{
      this.logger.log('Starting stops database migration...');
      let limit = 1000;
      let offset = 0
      let stopsBasic : StopBasic[] = [];
      let hasMoreRows = true;

      while (hasMoreRows) {

        const readRunner = this.liveDataSource.createQueryRunner();
        await readRunner.connect();
        try{
        stopsBasic = await readRunner.query(
          'SELECT * FROM stops_basic ORDER BY ATCOCode LIMIT ? OFFSET ?',
          [limit, offset]
        );
      } catch (error){
        this.logger.error('Error when inserting stops:', error);
      } finally {
        await readRunner.release();
      }
        if (stopsBasic === undefined || stopsBasic.length == 0) {
          hasMoreRows = false;
          break;
        }

        this.isStopBasicArray(stopsBasic);

        await retryOnBusy(async () => {
        const writeRunner = this.liveDataSource.createQueryRunner();
        await writeRunner.connect();
        await writeRunner.startTransaction();
        try{
          await this.migrateStopsBatch(stopsBasic, writeRunner);        
          await writeRunner.commitTransaction();
        } catch (error) {
          this.logger.error('Error while performing Stops batch insert:', error);
          await writeRunner.rollbackTransaction();
          throw error;
        } finally {
          await writeRunner.release();
        }
      });
      offset += limit
    }
  }


  async migrateStopsBatch(stopsBasic: StopBasic[], queryRunner: any): Promise<void> {
    this.logger.log('Starting batch stop migration...');
    try {

      // Insert into new database
      const values = stopsBasic.flatMap(stopBasic => 
        [stopBasic.CommonName, stopBasic.ATCOCode, stopBasic.Latitude, stopBasic.Longitude, stopBasic.ModificationDateTime]
      );

      const placeholders = stopsBasic.map(() => '(?, ?, ?, ?, ?)').join(', ');
      
      await queryRunner.query(
        `INSERT or IGNORE INTO stops 
        (stop_name, stop_code, latitude, longitude, modification_date_time)
        VALUES ${placeholders}`, values
      );
      
      this.logger.log('✅ stops batch migrated successfully');
      
    } catch (error) {
      this.logger.error('Failed to migrate stops:', error);
      throw error;
    }
  }

  async performMigrationjourneys(): Promise<void>{
    this.logger.log('Starting journeys database migration...');
    let limit = 1000;
    let offset = 0
    let journeyBasic : JourneyBasic[] = [];
    await retryOnBusy(async () => {
      const writeRunner = this.liveDataSource.createQueryRunner();
      await writeRunner.connect();
      await writeRunner.startTransaction();
      try{
        writeRunner.query(
        `DROP TABLE IF EXISTS temp_batch`
        );

        await writeRunner.query(
        `CREATE TEMPORARY TABLE temp_batch AS
        SELECT *
        FROM (
          SELECT *,
                ROW_NUMBER() OVER (PARTITION BY stop_list ORDER BY "Index") as rn
          FROM journeys_basic
        ) t
        WHERE rn = 1`
        );
        writeRunner.commitTransaction()
      } catch (error) {
          this.logger.error('Error when creating temporary tables:', error);
          await writeRunner.rollbackTransaction();
          throw error;
        } finally {
          await writeRunner.release();
        }
    })

      

      let hasMoreRows = true
      while (hasMoreRows) {
        const readRunner = this.liveDataSource.createQueryRunner();
        await readRunner.connect();
        try{
        journeyBasic = await readRunner.query(
          'SELECT * FROM temp_batch ORDER BY "Index" LIMIT ? OFFSET ?',
          [limit, offset]
        );
      } catch (error){
        this.logger.error('Error when selecting from temp_batch:', error);
      } finally {
        readRunner.release()
      }
      if (journeyBasic === undefined || journeyBasic.length == 0) {
        hasMoreRows = false;
        break
      }

      this.isJourneyBasicArray(journeyBasic)
      await retryOnBusy(async () => {
        const BatchRunner = this.liveDataSource.createQueryRunner();
        await BatchRunner.connect();
        await BatchRunner.startTransaction();
        try{
          this.migratejourneysBatch(journeyBasic, BatchRunner);
          BatchRunner.commitTransaction()
        } catch (error) {
          this.logger.error('Error when performing Jourenys batch:', error);
          await BatchRunner.rollbackTransaction();
          throw error;
        } finally {
          await BatchRunner.release();
        }
      })

      offset += limit
    }
  }
        


  async migratejourneysBatch(journeysBasic: JourneyBasic[], queryRunner:any): Promise<void> {
    this.logger.log('Starting batch jounreys migration...');
    try {

      // Insert into new database
      const values = journeysBasic.flatMap(journeyBasic => 
        [journeyBasic.service, journeyBasic.origin, journeyBasic.origin_id, journeyBasic.destination, journeyBasic.destination_id,
          journeyBasic.direction, journeyBasic.valid_from, journeyBasic.valid_to, journeyBasic.date_added, journeyBasic.date_modified,
          journeyBasic.count
        ]
      );

      const placeholders = journeysBasic.map(() => '(?, ?, ?, ?, ?, ? ,? ,? ,? ,? ,?)').join(', ');
      await queryRunner.query(
        `INSERT or IGNORE INTO journeys 
        (service, origin_name, origin_code, destination_name, destination_code, direction, valid_from, valid_to, date_added, date_modified, count) 
          VALUES ${placeholders}`, values
      );

      this.logger.log('✅ journey batch migrated successfully');
      
    } catch (error) {
      this.logger.error('Failed to migrate journeys:', error);
      throw error;
    }
  }


  async performPopulationLogJunctions(): Promise<void>{
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const readRunner = this.liveDataSource.createQueryRunner();
        await readRunner.connect();
        let result: any[] = []
        try{
          result = await readRunner.query(`
            SELECT 
              j.journey_id as journey_id,
              jb.stop_list as stop_list
            FROM journeys_basic jb
            INNER JOIN journeys j ON j.service = jb.service
            AND j.origin_code = jb.origin_id
            AND j.destination_code = jb.destination_id
            AND j.date_modified = jb.date_modified
            AND j.count = jb.count
            ORDER BY jb."Index"
            LIMIT ? OFFSET ?
          `, [batchSize, offset]);
        } catch (error) {
          this.logger.error('Failed find stop journey link:', error);
          throw error;
        }finally {
          readRunner.release()
        }

        if (result.length === 0) {
          hasMore = false;
          break;
        }
        let values : Array<Log> = [];
        // Process each row
        for (const row of result) {
          const stopIDRunner = this.liveDataSource.createQueryRunner();
          await stopIDRunner.connect();
          let stopIds : Array<[number, number]> = []
          try{
            stopIds = await this.findStopIds(
              stopIDRunner,
              row.stop_list
            );
          } catch (error) {
            this.logger.error('Error while filding stopIds', error);
            throw error;
          }finally {
            stopIDRunner.release()
          }
          const journey_id : number = row.journey_id;

          //concatanates each [stop_id, stop_sequence, journey_id] data point into
          //a big list for batch processing
          if (stopIds.length > 0) { 

            let new_logs: Log[] = stopIds.map(stopId => ({
              stop_id: stopId[0],
              stop_sequence: stopId[1],
              journey_id: journey_id
            }));

            values = values.concat(new_logs);

          } else {
            this.logger.log(`found no stopIds for journey ` + journey_id);
          }
        }
        if (values.length === 0){
          this.logger.log(`no Logs to process`);
        }
        //once we create our batch list, we insert them all in a oner


        if (this.isLogArray(values)) {  
          await retryOnBusy(async () => {    
            const batchRunner = this.liveDataSource.createQueryRunner();
            await batchRunner.connect();
            await batchRunner.startTransaction();
            try{
              await this.populateLogBatches(
                values,
                batchRunner
              );
              await batchRunner.commitTransaction();
            } catch (error) {
              this.logger.error('Error while populating Log Batches:', error);
              await batchRunner.rollbackTransaction();
              throw error;
            } finally {
              await batchRunner.release();
            }
          })

        } else{
          this.logger.log(`Values are not valid form for Log`);
        }
        offset += batchSize;
        this.logger.log(`Processed ${offset} records`);

      }
  }

  private async findStopIds(
    queryRunner: any,
    stopIdentifiers: string
  ): Promise<Array<[number, number]>> {
    const identifiers = stopIdentifiers
      .split(',')
      .map(id => `'${id.trim()}'`)
      .filter(id => id !== "''");

    if (identifiers.length === 0) return [];

    //Gives a lookup for each stop_id and it's position
    let length_dict: { [key: string]: number } = {};
    let i = 0;
    for (let i = 0; i < identifiers.length; i++){
        length_dict[String(identifiers[i])] = i;
        //this.logger.log("key " + identifiers[i] + " value " + i)
    }
    const result = await queryRunner.query(`
      SELECT stop_id, stop_code 
      FROM stops 
      WHERE stop_code IN (${identifiers.join(',')})
    `);

    //Returns a list of each stop_id with its number in the journey
    const id_position_list = result.map(row => {
      //this.logger.log("key " + String(row.stop_code))
      //this.logger.log("value  " + length_dict["'" + String(row.stop_code) + "'"])
      return [row.stop_id, length_dict["'" + String(row.stop_code) + "'"]]});

    return id_position_list
  }

  // TODO
  // Check if this should have the same pattern as before
  async populateLogBatches(logs: Log[], queryRunner:any): Promise<void> {
    this.logger.log('Starting batch log population...');
    try {   
      if (logs.length === 0) {
        this.logger.log(`no new logs to populate`);
        return;
      }
      const chunkSize = 1000
      for (let i = 0; i < logs.length; i += chunkSize) {
        const values = logs.slice(i, i+chunkSize).flatMap(log => 
          [log.stop_id, log.journey_id, log.stop_sequence]
        );

        const placeholders = logs.slice(i, i+chunkSize).map(() => '(?, ?, ?)').join(', ');
        await queryRunner.query(
          `INSERT or IGNORE INTO logs 
          (stop_id, journey_id, stop_sequence)
          VALUES ${placeholders}`, values
        );        
      }
    }  catch (error) {
      this.logger.error('Failed to population logs:', error);
      throw error;
    }

  }


  async performMigrationArrivals(): Promise<void>{
      const batchSize = 100000;
      let offset = -1;
      let hasMore = true;
      this.logger.log('Starting arrivals database migration...');
      while (hasMore) {
        this.logger.log('Migrating Arrival batch');

        const readRunner = this.liveDataSource.createQueryRunner();
        await readRunner.connect();

        let indices :any[] = []

        try{
          indices  = await readRunner.query(`
            SELECT "index"
            FROM arrivals_basic
            WHERE valid = 1 AND "index" > ${offset}
            ORDER BY "index"
            LIMIT ${batchSize}
          `);
          } catch (error) {
            this.logger.error('Error while selecting valid arrival_basic:', error);
            throw error;
          }finally {
            readRunner.release()
          }        

        if (indices.length === 0) {
          hasMore = false
          break;
        }

        const newLastIndex = indices[indices.length - 1].index;

        await retryOnBusy(async () => {
          const batchRunner = this.liveDataSource.createQueryRunner();
          await batchRunner.connect();
          await batchRunner.startTransaction();     
          try{   
            await batchRunner.query(
              `
              INSERT or IGNORE INTO arrivals (log_id, trip_code, date, time)
              SELECT 
                l.log_id AS log_id,
                a.bus_id AS trip_code,
                a.date AS date,
                a.time AS time
              FROM arrivals_basic a
              INNER JOIN stops s 
                ON a.stop_id = s.stop_code
                AND s.valid = 1
              INNER JOIN journeys j 
                ON a.service = j.service 
                AND a.origin = j.origin_code
                AND a.destination = j.destination_code 
                AND a.count = j.count
                AND j.valid = 1
              INNER JOIN logs l 
                ON l.stop_id = s.stop_id                             
                AND l.journey_id = j.journey_id
              WHERE a.valid = 1
                AND a."index" > ${offset}
                AND a."index" <= ${newLastIndex}
            `);

            this.logger.log('Arrival batch migrated');
            await batchRunner.commitTransaction();
          } catch (error) {
            this.logger.error('Error while inserting arrival Batch:', error);
            await batchRunner.rollbackTransaction();
            throw error;
          } finally {
            await batchRunner.release();
          }
      })
      offset = newLastIndex
    }
  }

  async performMigrationTimetables(): Promise<void>{
  try{
    this.logger.log('Merging timetables');    
    // --- 1. Create temporary tables if not exist ---
    this.logger.log('Creating temp tables');
    await retryOnBusy(async () => {
      const tempCreateRunner = this.liveDataSource.createQueryRunner();
      await tempCreateRunner.connect()
      await tempCreateRunner.startTransaction();
      try{
        await tempCreateRunner.query(`
          CREATE TEMP TABLE IF NOT EXISTS chunk_groups (
            logId INTEGER,
            batchId INTEGER,
            cnt INTEGER,
            hash TEXT,
            date_valid_on DATE
          )
        `);

        await tempCreateRunner.query(`
          CREATE TEMP TABLE IF NOT EXISTS new_basic_batch (
            timetablesBasicId INTEGER,
            day TEXT,
            date_valid_on DATE,
            logId INTEGER,
            batchId INTEGER
          )
        `);

        await tempCreateRunner.query(`
          CREATE TEMP TABLE IF NOT EXISTS new_info_batch (
            timetablesInformationId INTEGER,
            logId INTEGER,
            batchId INTEGER
          )
        `);

        await tempCreateRunner.query(`
          CREATE TEMPORARY TABLE IF NOT EXISTS temp_groups (
            logId INTEGER,
            batchId INTEGER,
            cnt INTEGER,
            concat_values TEXT,
            date_valid_on DATE
          )
        `);

        await tempCreateRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_temp_groups_order ON temp_groups (logId, batchId);
        `);

        await tempCreateRunner.commitTransaction();
        } catch (error) {
          this.logger.error('Error while creating temp tables:', error);
          await tempCreateRunner.rollbackTransaction();
          throw error;
        } finally {
          await tempCreateRunner.release();
        }  
    })    

    this.logger.log('inserting into temp_groups');

    await retryOnBusy(async () => {
      const tempgroupsRunner = this.liveDataSource.createQueryRunner();
      await tempgroupsRunner.connect()
      await tempgroupsRunner.startTransaction();   
      try{   
        await tempgroupsRunner.query(`
          INSERT INTO temp_groups (logId, batchId, cnt, concat_values, date_valid_on)
          SELECT 
            l.log_id AS logId,
            tb.name AS batchId, 
            COUNT(*) AS cnt, 
            group_concat(tb.time ORDER BY tb.time) AS concat_values,
            tb.created_at AS date_valid_on
          FROM timetables_basic tb
          INNER JOIN stops s ON tb.stop_id = s.stop_code
          INNER JOIN journeys j 
            ON tb.service = j.service 
            AND tb.origin_id = j.origin_code
            AND tb.destination_id = j.destination_code 
            AND tb.count = j.count
          INNER JOIN logs l 
            ON l.stop_id = s.stop_id                             
            AND l.journey_id = j.journey_id
          WHERE tb.is_active = 1
          GROUP BY l.log_id, tb.name;
        `);
      await tempgroupsRunner.commitTransaction();
    } catch (error) {
      this.logger.error('Error while inserting into temp groups:', error);
      await tempgroupsRunner.rollbackTransaction();
      throw error;
    } finally {
      await tempgroupsRunner.release();
    }  
  })

  this.logger.log('precalculating joins');
    await retryOnBusy(async () => {
      const precomputeRunner = this.liveDataSource.createQueryRunner();
      await precomputeRunner.connect()
      await precomputeRunner.startTransaction();        
      try{
        await precomputeRunner.query(`
          CREATE TEMP TABLE IF NOT EXISTS precomputed_timetables AS
          SELECT 
              l.log_id AS logId,
              tb.name AS batchId,   
              tb.time AS time
          FROM timetables_basic tb
          INNER JOIN stops s ON tb.stop_id = s.stop_code
          INNER JOIN journeys j 
              ON tb.service = j.service 
              AND tb.origin_id = j.origin_code
              AND tb.destination_id = j.destination_code 
              AND tb.count = j.count
          INNER JOIN logs l 
              ON l.stop_id = s.stop_id                             
              AND l.journey_id = j.journey_id
          WHERE tb.is_active = 1;
        `)

        await precomputeRunner.query(`
          CREATE INDEX IF NOT EXISTS idx_precomputed_log_batch ON precomputed_timetables (logId, batchId);
        `)

      await precomputeRunner.commitTransaction();
    } catch (error) {
      this.logger.error('Error while precalculating joins:', error);
      await precomputeRunner.rollbackTransaction();
      throw error;
    } finally {
      await precomputeRunner.release();
    }       
  }) 

    
  this.logger.log('computing hash keys');
  await retryOnBusy(async () => {
    const keyRunner = this.liveDataSource.createQueryRunner();
    await keyRunner.connect()
    await keyRunner.startTransaction();      
    try{ 
      await keyRunner.query(`
        CREATE TEMP TABLE IF NOT EXISTS most_recent_keys AS
        SELECT t.log_id, t.daily_times_count, t.values_hash
        FROM timetables_information t
        INNER JOIN (
            SELECT log_id, day, MAX(date_valid_on) AS max_date
            FROM timetables_information
            GROUP BY log_id, day
        ) m ON t.log_id = m.log_id
            AND t.day = m.day
            AND t.date_valid_on = m.max_date;
      `)      

      await keyRunner.query(`
        CREATE INDEX idx_most_recent_keys ON most_recent_keys(log_id, daily_times_count, values_hash);
      `) 

      keyRunner.commitTransaction()
    } catch (error) {
      this.logger.error('Error while compiling previous timetable keys:', error);
      await keyRunner.rollbackTransaction();
      throw error;
    } finally {
      await keyRunner.release();
    }   
  })


    const CHUNK_SIZE = 200; // groups per chunk
    let offset = 0;
    this.logger.log('Starting batch hashing and insertion');
    while (true) {

      // --- 2a. Fetch next chunk from temp_groups ---
      this.logger.log('Selecting batch from groups');

      let groups :any[] = []
      const readRunner = this.liveDataSource.createQueryRunner();
      await readRunner.connect() 
      try{
        groups = await readRunner.query(
          `SELECT logId, batchId, cnt, concat_values, date_valid_on FROM temp_groups LIMIT ? OFFSET ?`,
          [CHUNK_SIZE, offset]
        );
      } catch (error) {
        this.logger.error('Error while selecting batch from groups:', error);
        throw error;
      } finally {
        await readRunner.release();
      }

      if (groups.length === 0) break;
      offset += groups.length;

      this.logger.log('Hashing batch');
      // --- 2b. Compute hash for each group ---
      const groupsWithHash = groups.map(g => ({
        logId: g.logId,
        batchId: g.batchId,
        cnt: g.cnt,
        hash: createHash('sha256').update(g.concat_values).digest('hex'),
        date_valid_on: g.date_valid_on
      }));

      // --- 2c. Clear and fill chunk_groups ---

      await retryOnBusy(async () => {
        const chunkGroupsRunner = this.liveDataSource.createQueryRunner();
        await chunkGroupsRunner.connect() 
        await chunkGroupsRunner.startTransaction();
        try{
          await chunkGroupsRunner.query(`DELETE FROM chunk_groups`);

          const insertChunkSql = `
            INSERT INTO chunk_groups (logId, batchId, cnt, hash, date_valid_on) VALUES
            ${groupsWithHash.map(() => '(?, ?, ?, ?, ?)').join(',')}
          `;
          const chunkParams = groupsWithHash.flatMap(g => [g.logId, g.batchId, g.cnt, g.hash, g.date_valid_on]);
          await chunkGroupsRunner.query(insertChunkSql, chunkParams);
          await chunkGroupsRunner.commitTransaction();
        } catch (error) {
          this.logger.error('Error while deleting and filling chunk_groups:', error);
          await chunkGroupsRunner.rollbackTransaction();
          throw error;
        } finally {
          await chunkGroupsRunner.release();
        }
      })

      // --- 2d. Identify new groups ---
      this.logger.log('computing newly created timetables');
      let newGroupsRows :any[] = []

      const readRunner2 = this.liveDataSource.createQueryRunner();
      await readRunner2.connect();
      try{         
        newGroupsRows = await readRunner2.query(`
          SELECT cg.logId, cg.batchId, cg.cnt, cg.hash, cg.date_valid_on
          FROM chunk_groups cg
          WHERE NOT EXISTS (
              SELECT 1
              FROM most_recent_keys mrk
              WHERE mrk.log_id = cg.logId
                AND mrk.daily_times_count = cg.cnt
                AND mrk.values_hash = cg.hash
          );
        `);
      } catch (error) {
        this.logger.error('Migration failed:', error);
        throw error;
      } finally {
        await readRunner2.release();
      }

      if (newGroupsRows.length === 0) {
        this.logger.log('no new groups detected, continuing');
        continue; // no new groups in this chunk
      }

      // --- 2e. Insert new groups into timetables_information and get IDs ---
      this.logger.log('Inseting timetables_information batch');

      const insertInfoSql = `
        INSERT OR IGNORE INTO timetables_information (log_id, daily_times_count, values_hash, date_valid_on, day)
        VALUES ${newGroupsRows.map(() => '(?, ?, ?, ?, ?)').join(',')}
        RETURNING timetable_information_id, log_id, daily_times_count, values_hash
      `;
      const infoParams = newGroupsRows.flatMap(g => [g.logId, g.cnt, g.hash, g.date_valid_on, g.batchId]);

      const insertedInfos = await retryOnBusy(async () => {
        const insertedInfosRunner = this.liveDataSource.createQueryRunner();
        await insertedInfosRunner.connect() 
        await insertedInfosRunner.startTransaction();
        let insertedInfos : any[] = []
        try{
          insertedInfos = await insertedInfosRunner.query(insertInfoSql, infoParams);
          await insertedInfosRunner.commitTransaction();
        } catch (error) {
          this.logger.error('Error while inserting into timetables_information :', error);
          await insertedInfosRunner.rollbackTransaction();
          throw error;
        } finally {
          await insertedInfosRunner.release();
        }      
        return insertedInfos      
      })

      if (insertedInfos.length === 0){
        continue
      }

      // --- 2f. Map (logId, cnt, hash) -> new ID ---
      const infoMap = new Map(
        insertedInfos.map(row => [`${row.log_id}-${row.daily_times_count}-${row.values_hash}`, row.timetable_information_id])
      );

      // --- 2g. Prepare mapping for new_info_batch ---
      const batchMapping = newGroupsRows.map(g => {
        const key = `${g.logId}-${g.cnt}-${g.hash}`;
        const infoId = infoMap.get(key);
        if (!infoId) throw new Error('Inconsistency: inserted info not found in map');
        return { timetablesInformationId: infoId, logId: g.logId, batchId: g.batchId };
      });

      // Clear and fill new_info_batch
      const insertMappingSql = `
        INSERT OR IGNORE INTO new_info_batch (timetablesInformationId, logId, batchId) VALUES
        ${batchMapping.map(() => '(?, ?, ?)').join(',')}
      `;
      const mappingParams = batchMapping.flatMap(m => [m.timetablesInformationId, m.logId, m.batchId]);

      await retryOnBusy(async () => {
        const newInfoBatchRunner = this.liveDataSource.createQueryRunner();
        await newInfoBatchRunner.connect() 
        await newInfoBatchRunner.startTransaction();
        try{
          await newInfoBatchRunner.query(`DELETE FROM new_info_batch`);
          await newInfoBatchRunner.query(insertMappingSql, mappingParams);
          await newInfoBatchRunner.commitTransaction();
        } catch (error) {
          this.logger.error('Error while insering into new__info_batch:', error);
          await newInfoBatchRunner.rollbackTransaction();
          throw error;
        } finally {
          await newInfoBatchRunner.release();
        }
      })                

      // --- 2h. Bulk insert timetables ---
      this.logger.log('Inseting timetables batch');

      await retryOnBusy(async () => {
        const timetableInformationRunner = this.liveDataSource.createQueryRunner();
        await timetableInformationRunner.connect() 
        await timetableInformationRunner.startTransaction();          
        try{
          await timetableInformationRunner.query(`
            INSERT OR IGNORE INTO timetables (timetable_information_id, time)
            SELECT 
              nib.timetablesInformationId, 
              pt.time
            FROM precomputed_timetables pt
            INNER JOIN new_info_batch nib 
              ON pt.logId = nib.logId AND pt.batchId = nib.batchId
          `);
          await timetableInformationRunner.commitTransaction();
        } catch (error) {
          this.logger.error('Error while inserting into timetables:', error);
          await timetableInformationRunner.rollbackTransaction();
          throw error;
        } finally {
          await timetableInformationRunner.release();
        }            
      })

    }
  } catch (error) {
    this.logger.error('Migration failed:', error);
    throw error;
  } finally { 
    await retryOnBusy(async () => {
      const cleanupRunner = this.liveDataSource.createQueryRunner();
      await cleanupRunner.connect() 
      await cleanupRunner.startTransaction();  

      try{
        await cleanupRunner.query(`DROP TABLE IF EXISTS chunk_groups`);
        await cleanupRunner.query(`DROP TABLE IF EXISTS precomputed_timetables`);
        await cleanupRunner.query(`DROP TABLE IF EXISTS new_info_batch`);
        await cleanupRunner.query(`DROP TABLE IF EXISTS temp_groups`);
        await cleanupRunner.query(`DROP TABLE IF EXISTS most_recent_keys`);
        await cleanupRunner.commitTransaction();
      } catch (error) {
        this.logger.error('Error while cleaning up temp tables:', error);
        await cleanupRunner.rollbackTransaction();
        throw error;
      } finally {
        await cleanupRunner.release();
      }  
    })
  }
}

  private getDate(unixTime : number): number{
      const date = new Date(unixTime * 1000); 
      const year = date.toLocaleString('en-US', { timeZone: 'Europe/London', year: 'numeric' });
      const month = date.toLocaleString('en-US', { timeZone: 'Europe/London', month: '2-digit' });
      const day = date.toLocaleString('en-US', { timeZone: 'Europe/London', day: '2-digit' });
      return Number(`${year}${month}${day}`)
  }

  private  getTime(unixTime : number): any{
      const date = new Date(unixTime * 1000); 
      const hour = date.toLocaleString('en-US', { timeZone: 'Europe/London', hour: 'numeric', hour12: false });
      const minute = date.toLocaleString('en-US', { timeZone: 'Europe/London', minute: 'numeric' });
      const second = date.toLocaleString('en-US', { timeZone: 'Europe/London', second: 'numeric' });
      return (Number(hour)*60*60) + (Number(minute) * 60) + Number(second)
  }

  private isStopBasic(sample: any): sample is StopBasic {
    return (
      sample !== null &&
      sample !== undefined &&
      typeof sample === 'object' &&
      typeof sample.ATCOCode === 'string' &&
      typeof sample.CommonName === 'string' &&
      typeof sample.Latitude === 'number' &&
      typeof sample.Longitude === 'number' &&
      typeof sample.ModificationDateTime === 'number'
    );
  }

  private isStopBasicArray(sample : any): sample is StopBasic[] {
    if (!Array.isArray(sample)) {
      return false;
    }

    // Check each element in the array
    return sample.every(item => 
      this.isStopBasic(item)
    );
  }

  private isJourneyBasic(sample: any): sample is JourneyBasic {
    return (
      sample !== null &&
      sample !== undefined &&
      typeof sample === 'object' &&
      typeof sample.service === 'string' &&
      typeof sample.route_section_name === 'string' &&
      typeof sample.direction === 'string' &&
      typeof sample.origin === 'string' &&
      typeof sample.destination === 'string' &&
      typeof sample.valid_from === 'number' &&
      typeof sample.valid_to === 'number' &&
      typeof sample.stop_list === 'string' &&
      typeof sample.date_added === 'number' &&
      typeof sample.date_modified === 'number' &&
      typeof sample.entry_created_at === 'number' &&
      typeof sample.is_active === 'number' &&
      typeof sample.origin_id === 'string' &&
      typeof sample.destination_id === 'string' &&
      typeof sample.validated === 'number' &&
      typeof sample.route_section_id === 'string' &&
      typeof sample.count === 'number' 
    );
  }

  private isJourneyBasicArray(sample : any): sample is JourneyBasic[] {
    if (!Array.isArray(sample)) {
      return false;
    }

    // Check each element in the array
    return sample.every(item => 
      this.isJourneyBasic(item)
    );
  }

  private isArrivalBasic(sample: any): sample is ArrivalBasic {
    return (
      sample !== null &&
      sample !== undefined &&
      typeof sample === 'object' &&
      typeof sample.service === 'string' &&
      typeof sample.origin === 'string' &&
      typeof sample.destination === 'string' &&
      typeof sample.date_added === 'number' &&
      typeof sample.stop_id === 'string' &&
      typeof sample.time === 'number' &&
      typeof sample.date === 'number' &&
      typeof sample.bus_id === 'number' &&
      typeof sample.count === 'number'

    );
  }

  private isArrivalBasicArray(sample : any): sample is ArrivalBasic[] {
    if (!Array.isArray(sample)) {
      return false;
    }

    // Check each element in the array
    return sample.every(item => 
      this.isArrivalBasic(item)
    );
  }

  private isLog(sample: any): sample is Log {
      if (sample === null ||
      sample === undefined ){
        this.logger.log(`sample not defined`);
      }

      if (typeof sample != 'object'){
        this.logger.log(`sample not object`);
      }

    if (typeof sample.stop_sequence != 'number'){
      this.logger.log(`stop_sequence not number`);
    }
    if (typeof sample.stop_id != 'number'){
      this.logger.log(`stop_id not number`);
    }
    if (typeof sample.journey_id != 'number'){
      this.logger.log(`journey_id not number`);
    }
    return (
      sample !== null &&
      sample !== undefined &&
      typeof sample === 'object' &&
      typeof sample.stop_sequence === 'number' &&
      typeof sample.stop_id === 'number' &&
      typeof sample.journey_id === 'number'
    );
  }

  private isLogArray(sample : any): sample is Log[] {
    if(sample.length === 0){
      this.logger.log(`empty array`);
    }

    if (!Array.isArray(sample)) {
      this.logger.log(`not an array`);
      return false;
    }

    // Check each element in the array
    return sample.every(item => 
      this.isLog(item)
    );
  }

}