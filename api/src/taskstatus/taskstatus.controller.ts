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
    if (await this.taskStatusService.isTaskRunning(task_name)){
      return "running"
    } else if (await this.taskStatusService.isTaskFailed(task_name)) {
      return "failed"
     } else {
      return "succeeded"
     }
  }

  @Admin()
  @Post('start_task')
  async startTask(@Body() task_name: string){
    this.taskStatusService.startTask(task_name)
  }

  @Admin()
  @Post('end_task')
  async endTask(@Body() task_name: string){
    this.taskStatusService.endTask(task_name)
  }

  @Admin()
  @Post('fail_task')
  async failTask(@Body() task_name: string){
    this.taskStatusService.failTask(task_name)
  }
}