import { DataSource } from 'typeorm';
import { ApiKeyEntity } from './auth/entities/apikey.entity';
import { JourneyBasicEntity } from './basic/entities/journey.basic.entity';
import { ArrivalBasicEntity } from './basic/entities/arrival.basic.entity';
import { StopBasicEntity } from './basic/entities/stop.basic.entity';
import { TimetableBasicEntity } from './basic/entities/timetable.basic.entity';
import { JourneyEntity } from './journey/entities/journey.entity';
import { ArrivalEntity } from './log/entities/arrival.entity';
import { StopEntity } from './stop/entities/stop.entity';
import { TimetableInformationEntity } from './timetable/entities/timetable_information_entity';
import { TimetableEntity } from './timetable/entities/timetable.entity';
import { LogEntity } from './log/entities/log.entity';


const databasePath = process.env.DATABASE_PATH || 'London_Main.db';
export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: databasePath,
  entities: [
    ApiKeyEntity,
    JourneyBasicEntity,
    ArrivalBasicEntity,
    StopBasicEntity,
    TimetableBasicEntity,
    JourneyEntity,
    ArrivalEntity,
    StopEntity,
    TimetableInformationEntity,
    TimetableEntity,
    LogEntity,
  ],
  migrations: ['src/migrations/*.ts'], // where migration files will live
  synchronize: false,
  extra: {
    busyTimeout: 5000,
  },
});