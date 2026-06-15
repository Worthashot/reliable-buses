import { Injectable } from '@nestjs/common';

@Injectable()
export class TaskStatusService {
  private busyFlags = new Map<string, string[]>();

  isTaskRunning(taskName: string): boolean {
    const flag = this.busyFlags.get(taskName);
    return flag?.[0] === '1';
  }

  isTaskFailed(taskName: string): boolean {
    const flag = this.busyFlags.get(taskName);
    return flag?.[0] === '2';
  }

  startTask(taskName: string): void {
    this.busyFlags.set(taskName, ['1']);
  }

  failTask(taskName: string): void {
    this.busyFlags.set(taskName, ['2']);
  }

  endTask(taskName: string): void {
    this.busyFlags.set(taskName, []);
  }
}