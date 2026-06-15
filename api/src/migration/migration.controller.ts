// migration.controller.ts
import { Controller, Post, Get, Logger, Body } from '@nestjs/common';
import { MigrationService } from './migration.service';
import { Res } from '@nestjs/common';
import { Public, Private, Admin } from '../auth/decorators/permission.decorator'
import type { Response } from 'express';
import { TaskStatusService } from 'src/taskstatus/taskstatus.service';
import { ServiceUnavailableException } from '@nestjs/common';

@Controller('migration')
export class MigrationController {
  constructor(private readonly migrationService: MigrationService,
              private taskStatus: TaskStatusService,
  ) {}
  private readonly logger = new Logger(MigrationController.name);
  
  @Admin()
  @Post('daily_migration')
  async runMigrationLogs(@Res() res: Response) {
  if (this.taskStatus.isTaskRunning("migrating")) {
    throw new ServiceUnavailableException({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Database is temporarily busy with a maintenance task. Please retry later.',
      retryAfter: 3600,
    });  
  }
    res.status(202).json({ message: 'Task accepted' });
    this.logger.log('Starting database migration...');
    this.taskStatus.startTask("migrating")
    setImmediate(async () => {
      try {
        await this.migrationService.dailyMigration();
      } catch (error) {
        this.logger.error('Migration failed', error);
        this.taskStatus.startTask("migrating")
        throw error
      }
      this.taskStatus.endTask("migrating")
    });
  }

  @Admin()
  @Post('test_timetable_merge')
  public testTimetableMerging() {
    return  this.migrationService.testTimetableMerge()
  }

  @Admin()
  @Post('test_timetable_log_count')
  public testCounting() {
    return  this.migrationService.countLogTimetables()
  }

}