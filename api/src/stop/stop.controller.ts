// migration.controller.ts
import { Controller, Post, Get, Logger } from '@nestjs/common';
import { StopService } from './stop.service';
import { Public, Private, Admin } from '../auth/decorators/permission.decorator'
import { GetJourneyStopNamesDto } from './dto/get.journey.stop.name.dto';
import { Query} from '@nestjs/common';
@Controller('stop')
export class StopController {
  constructor(private readonly stopService: StopService) {}
  private readonly logger = new Logger(StopService.name);
  
  @Public()
  @Get('name_from_service')
  async runMigrationLogs(@Query() getJourneyStopNamesDto : GetJourneyStopNamesDto) {
    this.logger.log('fetching stop names');
    this.logger.log('got ' + getJourneyStopNamesDto.direction);
    this.logger.log('got ' + getJourneyStopNamesDto.service);
    return await this.stopService.getJourneyStopNames(getJourneyStopNamesDto)
  }

}