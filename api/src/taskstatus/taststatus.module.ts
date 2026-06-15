import { Module } from '@nestjs/common';
import { TaskStatusService } from './taskstatus.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskStatusController } from './taskstatus.controller';
@Module({
  imports: [TypeOrmModule.forRootAsync({ name: 'live'})],
  providers: [TaskStatusService],
  controllers: [TaskStatusController],
  exports: [TaskStatusService],
})
export class TaskStatusModule {}