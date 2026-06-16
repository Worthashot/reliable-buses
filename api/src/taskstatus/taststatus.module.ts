import { Module } from '@nestjs/common';
import { TaskStatusService } from './taskstatus.service';
import { TaskStatusController } from './taskstatus.controller';
@Module({
  providers: [TaskStatusService],
  controllers: [TaskStatusController],
  exports: [TaskStatusService],
})
export class TaskStatusModule {}