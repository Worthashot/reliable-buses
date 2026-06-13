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
import { retryOnBusy
  
 } from 'src/common/retry.on.busy';
@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  //stores the status for migrating
  //0 -- succes
  //1 -- currently migrating
  //2 -- failed
  private is_migrating: string[] = ["0"]
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
    const queryRunner = this.liveDataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await this.createTimetablesInformationTable(queryRunner);
      await this.createTimetableTable(queryRunner);
      await this.performMigrationTimetables(queryRunner);

      
      console.log('✅ Migration completed successfully!');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    } finally {
      console.log('releasing queryRunner');
      await queryRunner.release();
    }

  }

  async dailyMigration(): Promise<void>{
    this.is_migrating = ["1"]
    const queryRunner = this.liveDataSource.createQueryRunner();
    await queryRunner.connect();

    try {

      await this.createStopsTable(queryRunner);

      await this.createjourneysTable(queryRunner);

      await this.createLogsTable(queryRunner);

      await this.createArrivalsTable(queryRunner);

      await this.createTimetablesInformationTable(queryRunner);

      await this.createTimetableTable(queryRunner);

      await this.performMigrationStops(queryRunner);

      await this.performMigrationjourneys(queryRunner);

      await this.performPopulationLogJunctions(queryRunner);
      
      await this.performMigrationArrivals(queryRunner);

      await this.performMigrationTimetables(queryRunner);
    
      this.logger.log('✅ Migration completed successfully!');
      this.is_migrating = ["0"]
    } catch (error) {
      this.logger.error('❌ Migration failed:', error);
      this.is_migrating = ["2"]
      throw error;
    } finally {
      this.logger.log('releasing queryRunner');
      await queryRunner.release();
    }

      await this.countLogTimetables();
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

  public check_migrating(): string[]{
    return this.is_migrating
  }

  async createStopsTable(queryRunner : any): Promise<void>{
    this.logger.log('Setting up table stops in database Live');

    // Check if log table exists, if not create it
    try{
    await queryRunner.startTransaction();
    const stopsTableExists = await queryRunner.hasTable('stops');

    if (!stopsTableExists) {
      this.logger.log('Creating stops table in database Live...');
      await queryRunner.query(`
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
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stops_stop_code_covering ON stops(stop_code, stop_id);
      `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_stops_stop_code_valid_stop_id ON stops(stop_code, valid, stop_id);
      `);


      this.logger.log('stops table created successfully');  
      } else {
      this.logger.log('stops table already exists');
    }
    await queryRunner.commitTransaction();
  } catch (error) {
    this.logger.error('Migration failed:', error);
    await queryRunner.rollbackTransaction();
    throw error;   
  }
  }

  async createjourneysTable(queryRunner : any): Promise<void>{
    this.logger.log('Setting up table journeys in database Live');


    // Check if log table exists, if not create it
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
      this.logger.error('Migration failed:', error);
      await queryRunner.rollbackTransaction();
      throw error;   
  }
}
  
  async createLogsTable(queryRunner : any): Promise<void>{
    this.logger.log('Setting up table logs in database Live');

    // Check if log table exists, if not create it
    try{
      await queryRunner.startTransaction();
      const logsTableExists = await queryRunner.hasTable('logs');

      if (!logsTableExists) {
        await queryRunner.query(`
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

      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_logs_stop_journey_log ON logs (stop_id, journey_id, log_id);
      `);

      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_logs_journey_stop_log ON logs (journey_id, stop_id, log_id);
      `);

      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_log_journey_id_stop_sequence ON logs(journey_id, stop_sequence);
      `);


        this.logger.log('logs table created successfully');
      } else {
        this.logger.log('logs table already exists');
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;   
    }
  }

  async createArrivalsTable(queryRunner : any): Promise<void>{
    this.logger.log('Setting up table arrivals in database Live');
  
      // Check if log table exists, if not create it
    try{
      await queryRunner.startTransaction();
      const arrivalsTableExists = await queryRunner.hasTable('arrivals');

      if (!arrivalsTableExists) {
        await queryRunner.query(`
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

      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_arrival_log_id ON arrivals(log_id);
      `);

      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_arrival_time ON arrivals(time);
      `);

        this.logger.log('arrivals table created successfully');
      } else {
        this.logger.log('arrivals table already exists');
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error('Migration failed:', error);
      await queryRunner.rollbackTransaction();
      throw error;   
    }

  } 

  async createTimetablesInformationTable(queryRunner : any): Promise<void>{
    this.logger.log('Setting up table timetable_information in database Live');
  
    try{
      await queryRunner.startTransaction();
      const arrivalsTableExists = await queryRunner.hasTable('timetables_information');

      if (!arrivalsTableExists) {
        await queryRunner.query(`
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

      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_timetables_log_id ON timetables_information(log_id);
      `);

      await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_timetables_log_day_date 
      ON timetables_information (log_id, day, date_valid_on);
      `);



        this.logger.log('timetables_information table created successfully');
      } else {
        this.logger.log('timetables_information table already exists');
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error('Migration failed:', error);
      await queryRunner.rollbackTransaction();
      throw error;   
    }

  } 

  async createTimetableTable(queryRunner : any): Promise<void>{
    this.logger.log('Setting up table timetables in database Live');
  
      // Check if log table exists, if not create it
    try{
      await queryRunner.startTransaction();
      const arrivalsTableExists = await queryRunner.hasTable('timetables');

      if (!arrivalsTableExists) {
        await queryRunner.query(`
          CREATE TABLE "timetables" (
            "timetable_id"	INTEGER NOT NULL,
            "time"	TEXT NOT NULL,
            "timetable_information_id"	INTEGER,
            PRIMARY KEY("timetable_id" AUTOINCREMENT),
            UNIQUE("timetable_information_id","time"),
            FOREIGN KEY("timetable_information_id") REFERENCES "timetables_information"("timetable_information_id") ON DELETE CASCADE
          )
        `);
        this.logger.log('timetables table created successfully');
      } else {
        this.logger.log('timetables table already exists');
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error('Migration failed:', error);
      await queryRunner.rollbackTransaction();
      throw error;   
    }

  } 
  
  async performMigrationStops(queryRunner : any): Promise<void>{
    try {
      this.logger.log('Starting stops database migration...');
      let limit = 1000;
      let offset = 0
      let stopsBasic : StopBasic[];
      do{
        // Read from old database
        await queryRunner.startTransaction();
        stopsBasic = await queryRunner.query(
          'SELECT * FROM stops_basic ORDER BY ATCOCode LIMIT ? OFFSET ?',
          [limit, offset]
        );
        if (stopsBasic === undefined || stopsBasic.length == 0) {
          await queryRunner.commitTransaction();
          break;
        }
        
        this.isStopBasicArray(stopsBasic)
        await this.migrateStopsBatch(stopsBasic, queryRunner);
        offset += limit
        await queryRunner.commitTransaction();
      } while (stopsBasic.length === limit)

      
      this.logger.log('Migration completed successfully!');
    } catch (error) {
      this.logger.error('Migration failed:', error);
      await queryRunner.rollbackTransaction();
      throw error;
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

  async performMigrationjourneys(queryRunner : any): Promise<void>{
    try {
      await queryRunner.startTransaction();
      this.logger.log('Starting journeys database migration...');
      let limit = 1000;
      let offset = 0
      let journeyBasic : JourneyBasic[];

      await queryRunner.query(
        `DROP TABLE IF EXISTS temp_batch`
        );

      await queryRunner.query(
        `CREATE TEMPORARY TABLE temp_batch AS
        SELECT *
        FROM (
          SELECT *,
                ROW_NUMBER() OVER (PARTITION BY stop_list ORDER BY "Index") as rn
          FROM journeys_basic
        ) t
        WHERE rn = 1`
        );


      do{
        // Read from old database
        journeyBasic = await queryRunner.query(
          'SELECT * FROM temp_batch ORDER BY "Index" LIMIT ? OFFSET ?',
          [limit, offset]
        );
        if (journeyBasic === undefined || journeyBasic.length == 0) {
          break;
        }
        this.isJourneyBasicArray(journeyBasic)
        await this.migratejourneysBatch(journeyBasic, queryRunner);
        offset += limit
        
        
      } while (journeyBasic.length === limit)

      await queryRunner.commitTransaction();
      this.logger.log('Migration completed successfully!');
    } catch (error) {
      this.logger.error('Migration failed:', error);
      await queryRunner.rollbackTransaction();
      throw error;
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


  async performPopulationLogJunctions(queryRunner : any): Promise<void>{

    try {
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {

        await queryRunner.startTransaction();
        const result = await queryRunner.query(`
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
        await queryRunner.commitTransaction();
        if (result.length === 0) {
          hasMore = false;
          break;
        }
        let values : Array<Log> = [];
        // Process each row
        for (const row of result) {
          await queryRunner.startTransaction();
          const stopIds = await this.findStopIds(
            queryRunner,
            row.stop_list
          );
          await queryRunner.commitTransaction();
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
          await this.populateLogBatches(
            values,
            queryRunner
          );
        } else{
          this.logger.log(`Values are not valid form for Log`);
        }
        offset += batchSize;
        this.logger.log(`Processed ${offset} records`);

      }
    } catch (error) {
      this.logger.error('Failed to create Logs:', error);
      await queryRunner.rollbackTransaction();
      throw error;
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

  async populateLogBatches(logs: Log[], queryRunner:any): Promise<void> {
    this.logger.log('Starting batch log population...');
    try {   
      if (logs.length === 0) {
        this.logger.log(`no new logs to populate`);
        return;
      }
      const chunkSize = 1000
      for (let i = 0; i < logs.length; i += chunkSize) {
        await queryRunner.startTransaction();
        const values = logs.slice(i, i+chunkSize).flatMap(log => 
          [log.stop_id, log.journey_id, log.stop_sequence]
        );

        const placeholders = logs.slice(i, i+chunkSize).map(() => '(?, ?, ?)').join(', ');
        await queryRunner.query(
          `INSERT or IGNORE INTO logs 
          (stop_id, journey_id, stop_sequence)
          VALUES ${placeholders}`, values
        );        
        await queryRunner.commitTransaction();
      }
    }  catch (error) {
      this.logger.error('Failed to population logs:', error);
      throw error;
    }

  }


  async performMigrationArrivals(queryRunner : any): Promise<void>{
    try {
      const batchSize = 100000;
      let offset = -1;
      let totalInserted = 0;
      let hasMore = true;
      this.logger.log('Starting arrivals database migration...');
      while (hasMore) {
        await queryRunner.startTransaction();
        this.logger.log('Migrating Arrival batch');
        const indices  = await queryRunner.query(`
          SELECT "index"
          FROM arrivals_basic
          WHERE valid = 1 AND "index" > ${offset}
          ORDER BY "index"
          LIMIT ${batchSize}
        `);

        if (indices.length === 0) {
          await queryRunner.commitTransaction();
          break;
        }

        const newLastIndex = indices[indices.length - 1].index;

        const inserted = await queryRunner.query(
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
        totalInserted += inserted.length;
        offset = newLastIndex;

        this.logger.log('Arrival batch migrated');
        await queryRunner.commitTransaction();
      }
      
      this.logger.log('Arrivals Migration completed successfully!');
    } catch (error) {
      this.logger.error('Migration failed:', error);
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }

  async performMigrationTimetables(queryRunner : any): Promise<void>{

    this.logger.log('Merging timetables');
    try {
      
      // --- 1. Create temporary tables if not exist ---
      this.logger.log('Creating temp tables');

      await queryRunner.startTransaction();
      await queryRunner.query(`
        CREATE TEMP TABLE IF NOT EXISTS chunk_groups (
          logId INTEGER,
          batchId INTEGER,
          cnt INTEGER,
          hash TEXT,
          date_valid_on DATE
        )
      `);

      await queryRunner.query(`
        CREATE TEMP TABLE IF NOT EXISTS new_basic_batch (
          timetablesBasicId INTEGER,
          day TEXT,
          date_valid_on DATE,
          logId INTEGER,
          batchId INTEGER
        )
      `);

      await queryRunner.query(`
        CREATE TEMP TABLE IF NOT EXISTS new_info_batch (
          timetablesInformationId INTEGER,
          logId INTEGER,
          batchId INTEGER
        )
      `);

      await queryRunner.query(`
        CREATE TEMPORARY TABLE IF NOT EXISTS temp_groups (
          logId INTEGER,
          batchId INTEGER,
          cnt INTEGER,
          concat_values TEXT,
          date_valid_on DATE
        )
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_temp_groups_order ON temp_groups (logId, batchId);
      `);

      this.logger.log('inserting into temp_groups');
      await queryRunner.query(`
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
      await queryRunner.commitTransaction();

      await queryRunner.startTransaction();
      this.logger.log('precalculating joins');
      await queryRunner.query(`
        CREATE TEMP TABLE IF NOT EXISTS precomputed_timetables AS
        SELECT 
            l.log_id AS logId,
            tb.name AS batchId,   -- adjust column name if different
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

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_precomputed_log_batch ON precomputed_timetables (logId, batchId);
      `)

      await queryRunner.commitTransaction();

      await queryRunner.startTransaction();

      await queryRunner.query(`
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

      await queryRunner.query(`
        CREATE INDEX idx_most_recent_keys ON most_recent_keys(log_id, daily_times_count, values_hash);
      `) 


      const CHUNK_SIZE = 200; // groups per chunk
      let offset = 0;
      await queryRunner.commitTransaction();
      this.logger.log('Starting batch hashing and insertion');
      while (true) {
        await queryRunner.startTransaction();
        // --- 2a. Fetch next chunk from temp_groups ---
        this.logger.log('Selecting batch from groups');
        const groups = await queryRunner.query(
          `SELECT logId, batchId, cnt, concat_values, date_valid_on FROM temp_groups LIMIT ? OFFSET ?`,
          [CHUNK_SIZE, offset]
        );
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
        await queryRunner.query(`DELETE FROM chunk_groups`);

        const insertChunkSql = `
          INSERT INTO chunk_groups (logId, batchId, cnt, hash, date_valid_on) VALUES
          ${groupsWithHash.map(() => '(?, ?, ?, ?, ?)').join(',')}
        `;
        const chunkParams = groupsWithHash.flatMap(g => [g.logId, g.batchId, g.cnt, g.hash, g.date_valid_on]);
        await queryRunner.query(insertChunkSql, chunkParams);

        // --- 2d. Identify new groups ---
        this.logger.log('computing newly created timetables');
        const newGroupsRows = await queryRunner.query(`
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
        const insertedInfos = await queryRunner.query(insertInfoSql, infoParams);

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
        await queryRunner.query(`DELETE FROM new_info_batch`);

        const insertMappingSql = `
          INSERT OR IGNORE INTO new_info_batch (timetablesInformationId, logId, batchId) VALUES
          ${batchMapping.map(() => '(?, ?, ?)').join(',')}
        `;
        const mappingParams = batchMapping.flatMap(m => [m.timetablesInformationId, m.logId, m.batchId]);
        await queryRunner.query(insertMappingSql, mappingParams);

        // --- 2h. Bulk insert timetables ---
        this.logger.log('Inseting timetables batch');
        await queryRunner.query(`
          INSERT OR IGNORE INTO timetables (timetable_information_id, time)
          SELECT 
            nib.timetablesInformationId, 
            pt.time
          FROM precomputed_timetables pt
          INNER JOIN new_info_batch nib 
            ON pt.logId = nib.logId AND pt.batchId = nib.batchId
        `);
        // Optional: commit transaction per chunk (if you started one)
        await queryRunner.commitTransaction();
      }
    }  catch (error) {
      this.logger.error('Failed to merge timetables:', error);
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.startTransaction();
      await queryRunner.query(`DROP TABLE chunk_groups`);
      await queryRunner.query(`DROP TABLE precomputed_timetables`);
      await queryRunner.query(`DROP TABLE new_info_batch`);
      await queryRunner.query(`DROP TABLE temp_groups`);
      await queryRunner.query(`DROP TABLE most_recent_keys`);
      await queryRunner.commitTransaction();
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