import { Injectable, Logger, OnModuleInit  } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

@Injectable()
export class TaskStatusService implements OnModuleInit {
  

  private readonly logger = new Logger(TaskStatusService.name);
  constructor(@InjectDataSource('live')
              private readonly dataSource: DataSource) {}

  async onModuleInit() {
    //Clear all previous tasks
      this.logger.log('Starting task "${taskName}"');
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try{
        await queryRunner.query(
          `DELETE FROM task_status;`,
        );      
        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        this.logger.error('Failed to clear tasks', error);
        throw error;
      } finally {
        await queryRunner.release();
      }
  }

  async isTaskRunning(taskName: string): Promise<boolean> {
    const result = await this.dataSource.query(
      'SELECT status FROM task_status WHERE task_name = ?',
      [taskName]
    );
    this.logger.log('Task ' + taskName + ' is ' + result[0]?.status);
    return result[0]?.status === 1
  }

  async isTaskFailed(taskName: string): Promise<boolean> {
    const result = await this.dataSource.query(
      'SELECT status FROM task_status WHERE task_name = ?',
      [taskName]
    );
    this.logger.log('Task ' + taskName + ' is ' + result[0]?.status);
    return result[0]?.status === 2;
  }

  async startTask(taskName: string): Promise<void> {
    this.logger.log('Starting task "${taskName}"');
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try{
      await queryRunner.query(
        `INSERT INTO task_status (task_name, status, updated_at)
         VALUES (?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(task_name) DO UPDATE SET status = 1, updated_at = CURRENT_TIMESTAMP`,
        [taskName]
      );      
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to start task ' + taskName + ':', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async failTask(taskName: string): Promise<void> {
    this.logger.log('Failing task "${taskName}"');
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try{
      await this.dataSource.query(
        `INSERT INTO task_status (task_name, status, updated_at)
        VALUES (?, 2, CURRENT_TIMESTAMP)
        ON CONFLICT(task_name) DO UPDATE SET status = 2, updated_at = CURRENT_TIMESTAMP`,
        [taskName]
      );      
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to fail task ' + taskName + ':', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async endTask(taskName: string): Promise<void> {
    this.logger.log('Ending task "${taskName}"');
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try{
      await this.dataSource.query(
        `INSERT INTO task_status (task_name, status, updated_at)
        VALUES (?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(task_name) DO UPDATE SET status = 0, updated_at = CURRENT_TIMESTAMP`,
        [taskName]
      );      
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to end task ' + taskName + ':', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}