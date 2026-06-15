import { Module } from '@nestjs/common';
import { TaskStatusService } from './taskstatus.service';

@Module({
  providers: [TaskStatusService],
  exports: [TaskStatusService],
})
export class TaskStatusModule {}