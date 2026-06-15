import { Module } from '@nestjs/common';
import { TaskStatusService } from './taskstatus.service';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forRootAsync({ name: 'live'})],
  providers: [TaskStatusService],
  exports: [TaskStatusService],
})
export class TaskStatusModule {}