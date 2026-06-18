import { Module  } from '@nestjs/common';
import {AuthModule} from './auth/auth.module';
import { TypeOrmModule  } from '@nestjs/typeorm';
import { ApiKeyEntity } from './auth/entities/apikey.entity';
import { LogEntity } from './log/entities/log.entity';
import { JourneyEntity } from './journey/entities/journey.entity';
import { StopEntity } from './stop/entities/stop.entity';
import { ArrivalEntity } from './log/entities/arrival.entity';
import { TimetableInformationEntity } from './timetable/entities/timetable_information_entity';
import { TimetableEntity } from './timetable/entities/timetable.entity';
import { ConfigModule } from '@nestjs/config';
import { LogModule } from './log/log.module';
import { JourneyModule } from './journey/journey.module';
import { ArrivalBasicEntity } from './basic/entities/arrival.basic.entity';
import { JourneyBasicEntity } from './basic/entities/journey.basic.entity';
import { StopBasicEntity } from './basic/entities/stop.basic.entity';
import { TimetableBasicEntity } from './basic/entities/timetable.basic.entity';
import { BasicModule } from './basic/basic.module';
import { StopModule } from './stop/stop.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail/mail.service';
import { MailController } from './mail/mail.controller';
import { MigrationModule } from './migration/migration.module';
import { TaskStatusModule } from './taskstatus/taststatus.module';
const databasePath = process.env.DATABASE_PATH || 'London_Main.db';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('EMAIL_HOST'),
          port: configService.get<number>('EMAIL_PORT'),
          secure: false, // true for port 465, false for other ports like 587
          auth: {
            user: configService.get<string>('EMAIL_AUTH_USER'),
            pass: configService.get<string>('EMAIL_AUTH_PASSWORD'),
          },
        },
        defaults: {
          from: `"${configService.get<string>('EMAIL_FROM_NAME')}" <${configService.get<string>('EMAIL_AUTH_USER')}>`,
        },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      name: "live",
      useFactory: () => ({
      type: 'better-sqlite3',
      database: databasePath, 
      entities: [ApiKeyEntity, 
        JourneyBasicEntity, ArrivalBasicEntity, StopBasicEntity, TimetableBasicEntity,
        JourneyEntity, ArrivalEntity, StopEntity, TimetableInformationEntity, TimetableEntity,
        LogEntity],
      synchronize: false,
          extra: {
      busyTimeout: 5000, // milliseconds
      },
    prepareDatabase(db) {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      // optional: set timeout again via pragma (redundant but safe)
      db.pragma('busy_timeout = 60000');
    },

      })
    }),

    TaskStatusModule,
    LogModule,
    MigrationModule,
    AuthModule,
    JourneyModule,
    BasicModule,
    StopModule,
  ],

  providers: [MailService],
  controllers: [MailController],
  exports: [TypeOrmModule],
})
export class AppModule {}
