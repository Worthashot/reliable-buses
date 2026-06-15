import { Controller, Post, Get, Logger, Body } from '@nestjs/common';
import { TaskStatusService } from './taskstatus.service';
import { Public, Private, Admin } from '../auth/decorators/permission.decorator'

@Controller('taskstatus')
export class TaskStatusController {
  constructor(private readonly taskStatusService: TaskStatusService,
  ) {}
  private readonly logger = new Logger(TaskStatusController.name);

  @Admin()
  @Post('get_status')
  async getStatus(@Body() task_name: string){
    if (this.taskStatusService.isTaskRunning(task_name)){
      return "running"
    } else if (this.taskStatusService.isTaskFailed(task_name)) {
      return "failed"
     } else {
      return "succeeded"
     }
  }
}