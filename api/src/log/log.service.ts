import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource} from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Log } from './interfaces/log.interface';
import { HistogramCreate } from './interfaces/histogram.create.interface';
import { Histogram } from './interfaces/histogram.interface';
import { spawn } from 'child_process';
import { LogEntity } from './entities/log.entity';
import * as os from 'os';
import { Readable } from 'stream';
import { StopEntity } from 'src/stop/entities/stop.entity';
import { ArrivalEntity } from './entities/arrival.entity';
import { JourneyEntity } from 'src/journey/entities/journey.entity';
import { GetTimeCount } from './interfaces/log.get.time.count';
import { GetArrivalImage } from './interfaces/log.get.arrival.image';
import { TimetableEntity } from 'src/timetable/entities/timetable.entity';
import { TimetableInformationEntity } from 'src/timetable/entities/timetable_information_entity';
import { resolve } from 'path';

@Injectable()
export class LogService {
  private readonly logger = new Logger(LogService.name);
  
  constructor(
    @InjectDataSource('live') 
    private liveDataSource: DataSource,

    @InjectRepository(StopEntity, 'live')
    private stopRepository: Repository<StopEntity>,

    @InjectRepository(JourneyEntity, 'live')
    private journeyRepository: Repository<JourneyEntity>,

    @InjectRepository(ArrivalEntity, 'live')
    private arrivalRepository: Repository<ArrivalEntity>,

    @InjectRepository(TimetableEntity, 'live')
    private timetableRepository: Repository<TimetableEntity>,

    @InjectRepository(TimetableInformationEntity, 'live')
    private timetableInformationRepository: Repository<TimetableInformationEntity>,

    @InjectRepository(LogEntity, 'live')
    private logRepository: Repository<LogEntity>,

  ) {}  

    private getPythonInterpreter(): string {
    const base = resolve(process.cwd(), 'venv');
    if (process.platform === 'win32') {
      // Windows: venv\Scripts\python.exe
      return resolve(base, 'Scripts', 'python.exe');
    } else {
      // Linux / macOS: venv/bin/python3
      return resolve(base, 'bin', 'python3');
    }
    }

  async getArrivalImage(item: GetArrivalImage) :Promise<Buffer>{
    const stop_code = item.stop_code
    const service = item.service
    const direction = item.direction
    this.logger.log('got ' + stop_code);
    this.logger.log('got ' + service);
    this.logger.log('got ' + direction);
    this.logger.log('searching arrivals');
    const arrivals : [number, number][]= (await (this.arrivalRepository
          .createQueryBuilder('arrival')
          .select(['arrival.date', 'arrival.time',])
          .innerJoin('arrival.log', 'log')
          .innerJoin('log.journey', 'journey')
          .innerJoin('log.stop', 'stop')
          .where('stop.stop_code = :stop_code', { stop_code })
          .andWhere('journey.service = :service', { service })
          .andWhere('journey.direction = :direction', { direction })
          .getMany())).map(a => [a.date, a.time]);
    this.logger.log('got ' + arrivals);

    const timetables :number[] = (await (this.timetableRepository
          .createQueryBuilder('timetables')
          .select(['timetables.time'])
          .innerJoin('timetables.timetable_information', 'timetables_information')
          .innerJoin('timetables_information.log', 'log')
          .innerJoin('log.journey', 'journey')
          .innerJoin('log.stop', 'stop')
          .where('stop.stop_code = :stop_code', { stop_code })
          .andWhere('journey.service = :service', { service })
          .andWhere('journey.direction = :direction', { direction })
          .andWhere("timetables_information.day LIKE :substring", { substring: `%${"mon"}%` })
          .getMany())).map(a => a.time);
    this.logger.log('got ' + arrivals);    

    const input_data = JSON.stringify({arrivals,timetables})

    const pythonInterpreter = this.getPythonInterpreter()
    return new Promise((resolve, reject) => {
      // Use spawn to start Python
      const pythonProcess = spawn(pythonInterpreter, [
        'scripts/arrival_image_generator.py',   // path relative to project root
      ]);

      const chunks: Buffer[] = [];
      let errorOutput = '';

      // Collect stdout (the PNG bytes)
      pythonProcess.stdout.on('data', (data: Buffer) => {
        chunks.push(data);
      });

      // Collect stderr for error reporting
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${errorOutput}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });

      pythonProcess.on('error', (err) => {
        reject(new Error(`Failed to start Python process: ${err.message}`));
      });
      pythonProcess.stdin.write(input_data);
      pythonProcess.stdin.end();
    });
  }

  async getTimeCount(item : GetTimeCount) : Promise<string[]>{
    const stop_code = item.stop_code
    const service = item.service
    const direction = item.direction
    const time = item.time
    const arrival_count = (await (this.arrivalRepository
      .createQueryBuilder('arrival')
      .innerJoin('arrival.log', 'log')
      .innerJoin('log.journey', 'journey')
      .innerJoin('log.stop', 'stop')
      .where('stop.stop_code = :stop_code', { stop_code })
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

  async createHistogram(histogramCreate : HistogramCreate): Promise<Histogram>{
    const startTime = histogramCreate.timeRangeStart
    const endTime = histogramCreate.timeRangeEnd
    const samples = await this.getSamples(histogramCreate.journeyId, 
      histogramCreate.stopId, 
      startTime,
      endTime) 
    if (!this.isLogArray(samples)) {
      throw new Error('Unable to create samples');
    }
    //const times = samples.map(sample => sample.time)
    const times = 1
    const output = await this.generateHistogramPython(times, startTime, endTime)
    if (!this.isHistogram(output)){
      throw new Error('Unable to form histogram');
    }
    return output
  }
  private async getSamples(journeyId, stopId, timeRangeStart, timeRangeEnd): Promise<Log[] | void>{
    const queryString = `
    SELECT trip_id, journey_id, stop_id, date, time 
    FROM log 
    WHERE journey_id = ? 
    AND stop_id = ? 
    AND time BETWEEN ? AND ?
    `;

    const parameters = [journeyId, stopId, timeRangeStart, timeRangeEnd];

    this.logger.log('Loading data from histogram');
    
    const queryRunner = this.liveDataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const histogram = await queryRunner.query(queryString, parameters);
      this.logger.log('✅ histogram data loaded successfully');
      await queryRunner.commitTransaction()
      //return histogram.map(sample => this.logTransformer(sample))
      return;
    } catch (error) {
      this.logger.error('Failed to load histogram:', error);
      queryRunner.rollbackTransaction();
    } finally{
      await queryRunner.release();
    }    
  }

  private async generateHistogramPython(times, startTime, endTime): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonCommand = os.platform() === 'win32' ? 'python' : 'python3';
      const inputData = JSON.stringify({times, startTime, endTime});
      const pythonProcess = spawn(pythonCommand, ['C:\\Users\\Cameron\\Desktop\\BusProject_API\\production_api\\generateHistogram.py', inputData]);
      
      let result = '';
      let error = '';

      pythonProcess.stdout.on('data', (data) => {
        result += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(result));
          } catch (e) {
            reject(new Error('Failed to parse Python output'));
          }
        } else {
          reject(new Error(`Python process failed: ${error}`));
        }
      });
    });
  }

  async deleteOldLogs(ids: number[]): Promise<void>{
    this.logger.log('Deleting Log...');
    const queryRunner = this.liveDataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
        for (let i =0; i<ids.length; i += 1000){
          this.logger.log('Deleting Log batch...');

          let idsBatch = ids.slice(i, i+1000);
          let placeholders = idsBatch.map(() => '(?)').join(', ');

          await queryRunner.query(
            `DELETE FROM log WHERE id IN (${placeholders})`,
            idsBatch
          );
      }
      await queryRunner.commitTransaction();
      this.logger.log('✅ Logs deleted successfully');
      
    } catch (error) {
      this.logger.error('Failed to delete Logs:', error);
      await queryRunner.rollbackTransaction();
    } finally{
      await queryRunner.release();
    }      
  }

  private isLog(sample: any): sample is Log {
    return (
      sample !== null &&
      sample !== undefined &&
      typeof sample === 'object' &&
      typeof sample.tripID === 'number' &&
      typeof sample.journeyID === 'string' &&
      typeof sample.stopID === 'number' &&
      typeof sample.date === 'number' &&
      typeof sample.time === 'number'
    );
  }

  /*
  private logTransformer(logEntity : LogEntity): Log{
    const output : Log = {

      tripID:logEntity.arrivals.map(item => item.trip_code), 
      journeyID:logEntity.journey.journey_id,
      stopID:logEntity.stop.stop_id,
      date:logEntity.arrivals.map(item => item.date),
      time:logEntity.arrivals.map(item => item.time)
    } 
    return output
  }
    */

private isLogArray(samples: any): samples is Log[] {
  return (
    Array.isArray(samples) &&
    samples.length > 0 &&
    samples.every(sample => this.isLog(sample))
  );
}

  private isHistogram(sample : any): sample is Histogram {
    return (
        sample !== null &&
        sample !== undefined &&
        Array.isArray(sample.counts) &&
        sample.counts.every(item => typeof item === 'number' && !isNaN(item))&&      
        Array.isArray(sample.bins) &&
        sample.bins.every(item => typeof item === 'number' && !isNaN(item))
    )
  }

}
