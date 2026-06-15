import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

@Injectable()
export class TaskStatusService {
  

  private readonly logger = new Logger(TaskStatusService.name);
  constructor(@InjectDataSource('live')
              private readonly dataSource: DataSource) {}


  async isTaskRunning(taskName: string): Promise<boolean> {
    const result = await this.dataSource.query(
      'SELECT status FROM task_status WHERE task_name = ?',
      [taskName]
    );
    return result?.[0] === '1';
  }

  async isTaskFailed(taskName: string): Promise<boolean> {
    const result = await this.dataSource.query(
      'SELECT status FROM task_status WHERE task_name = ?',
      [taskName]
    );
    return result?.[0] === '2';
  }

  async startTask(taskName: string): Promise<void> {
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
      this.logger.error('Failed to start task "${taskName}":', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async failTask(taskName: string): Promise<void> {
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
      this.logger.error('Failed to start task "${taskName}":', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async endTask(taskName: string): Promise<void> {
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
      this.logger.error('Failed to start task "${taskName}":', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}