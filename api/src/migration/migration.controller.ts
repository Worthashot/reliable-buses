// migration.controller.ts
import { Controller, Post, Get, Logger, Body } from '@nestjs/common';
import { MigrationService } from './migration.service';
import { Res } from '@nestjs/common';
import { Public, Private, Admin } from '../auth/decorators/permission.decorator'
import type { Response } from 'express';


@Controller('migration')
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}
  private readonly logger = new Logger(MigrationService.name);
  
  @Admin()
  @Post('daily_migration')
  async runMigrationLogs(@Res() res: Response) {
    res.status(202).json({ message: 'Task accepted' });
    this.logger.log('Starting database migration...');
    setImmediate(async () => {
      try {
        await this.migrationService.dailyMigration();
      } catch (error) {
        this.logger.error('Migration failed', error);
      }
    });
  }

  @Admin()
  @Get('is_migrating')
  public checkMigration() {
    return  this.migrationService.check_migrating()
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

  @Admin()
  @Post('test_set_migrating_status')
  public testSetMigratingStatus(@Body() status: string[]) {
    return  this.migrationService.testSetMigratingStatus(status)
  }

}