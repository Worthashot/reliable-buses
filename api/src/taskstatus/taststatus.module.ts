import { Module } from '@nestjs/common';
import { TaskStatusService } from './taskstatus.service';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([])],
  providers: [TaskStatusService],
  exports: [TaskStatusService],
})
export class TaskStatusModule {}