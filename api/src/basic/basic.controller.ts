import { Controller, Get, Post, Delete, Req, Body, UseGuards,Logger } from '@nestjs/common';
import { BasicService } from './basic.service';
import { Admin } from 'src/auth/decorators/permission.decorator';
import { JourneyBasicAddElementDto } from './dto/journey_basic_add_element_dto';
import { StopBasicAddElementDto } from './dto/stop_basic_add_element_dto';
import { ArrivalBasicAddElementDto } from './dto/arrival_basic_add_element_dto';
import { ArrivalBasicModifyElementDto } from './dto/arrival_basic_modify_element_dto';
import { TimetableBasicAddElementDto } from './dto/timetable.basic.add.element.dto';
import type { Response } from 'express';
import { Res } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import { TaskStatusService } from 'src/taskstatus/taskstatus.service';
@Controller('basic')
export class BasicController {
    constructor (private basicService: BasicService,
                private taskStatus: TaskStatusService,
    ) {}
    private readonly logger = new Logger(BasicController.name);

  @Admin()
  @Post('journeys_set_inactive')
  async runConstructDailyourneys() {
    this.logger.log('setting basic journeys to inactive');
    return this.basicService.setBasicJourneysInactive()
  }

  @Admin()
  @Post('journeys_flag_inactive')
  async runFlagDailyourneys() {
    this.logger.log('setting basic journeys to inactive');
    return this.basicService.flagBasicJourneysInactive()
  }

  @Admin()
  @Post('journeys_restore_inactive')
  async runRestoreDailyourneys() {
    this.logger.log('setting basic journeys to inactive');
    return this.basicService.restoreBasicJourneysInactive()
  }

  @Admin()
  @Post('new_journeys')
  async addNewJourneysBasic(@Body() elements: JourneyBasicAddElementDto[]) {
    if (await this.taskStatus.isTaskRunning("migrating")) {
        throw new ServiceUnavailableException({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Database is temporarily busy with a maintenance task. Please retry later.',
          retryAfter: 3600,
        });  
      }
    this.logger.log('checking journeys_basic table exists in database');
    await this.basicService.createJourneysBasicTable()
    this.logger.log('adding journeys_basic to database');
    await this.basicService.addNewJourneyBasic(elements)
    this.logger.log('setting new journeys_basic to active');
    await this.basicService.setJourneyBasicActive(elements)
    this.logger.log('added journeys_basic to database success');
    return { message: 'Items created successfully', count: elements.length };
  }

  @Admin()
  @Post('new_stops')
  async addNewStopsBasic(@Body() elements: StopBasicAddElementDto[]) {
    if (await this.taskStatus.isTaskRunning("migrating")) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Database is temporarily busy with a maintenance task. Please retry later.',
        retryAfter: 3600,
      });  
    }
    this.logger.log('checking stops_basic table exists in database');
    await this.basicService.createStopsBasicTable()
    this.logger.log('adding stops_basic to database');
    await this.basicService.addNewStopBasic(elements)
    this.logger.log('added stops_basic to database success');
    return { message: 'Items created successfully', count: elements.length };
  }

  @Admin()
  @Post('new_arrivals')
  async addNewArrivalsBasic(@Body() elements: ArrivalBasicAddElementDto[]) {

    if (await this.taskStatus.isTaskRunning("migrating")) {
      this.logger.log('database merging, blocking request');
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Database is temporarily busy with a maintenance task. Please retry later.',
        retryAfter: 3600,
      });  
    }
    this.logger.log('checking arrivals_basic table exists in database');
    await this.basicService.createArrivalsBasicTable()
    this.logger.log('adding arrivals_basic to database');
    await this.basicService.addNewArrivalBasic(elements)
    this.logger.log('added arrivals_basic to database success');
    return { message: 'Items created successfully', count: elements.length };
  }

  @Admin()
  @Post('new_timetables')
  async addNewTimetablesBasic(@Body() elements: TimetableBasicAddElementDto[]) {     
    if (await this.taskStatus.isTaskRunning("migrating")) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Database is temporarily busy with a maintenance task. Please retry later.',
        retryAfter: 3600,
      });  
    } 
    this.logger.log('checking timetable_basic exists in database');
    await this.basicService.createTimetablesBasicTable()
    this.logger.log('adding timetable_basic to database');
    await this.basicService.addNewTimetableBasic(elements)
    this.logger.log('added timetable_basic to database success');
    return { message: 'Items created successfully', count: elements.length };
  }


  @Admin()
  @Get('valid_journeys')
  async getValidJourneysBasic() {
    this.logger.log('fetching valid journeys_basic from database');
    const journeys_basic = await this.basicService.getValidJourneysBasic();
    this.logger.log('success valid journeys_basic fetched from database');
    return journeys_basic
  }

  @Admin()
  @Get('active_journeys')
  async getActiveJourneysBasic() {
    this.logger.log('fetching valid journeys_basic from database');
    const journeys_basic = await this.basicService.getValidJourneysBasic();
    this.logger.log('success valid journeys_basic fetched from database');
    return journeys_basic
  }

  @Admin()
  @Post('set_active')
  async setJourneysBasicActive(@Body() elements: JourneyBasicAddElementDto[]) {
    this.logger.log('setting jouney_basic to active');
    await this.basicService.setJourneyBasicActive(elements)
    this.logger.log('jouney_basic set to active success');
    return { message: 'jouney_basic set to active successfully', count: elements.length };
  }  

  @Admin()
  @Post('create_tables')
  async createTables() {
    this.logger.log('creating any basic tables');
    await this.basicService.createJourneysBasicTable()
    await this.basicService.createStopsBasicTable()
    await this.basicService.createArrivalsBasicTable()
    await this.basicService.createTimetablesBasicTable()
    this.logger.log('tables created successfully');
    return;
  }    

  @Admin()
  @Delete('delete_all_invalid_arrivals')
  async deleteInvalidArrivalsBasic() {
    this.logger.log('deleting invalid arrival_basic entries');
    await this.basicService.deleteInvalidArrivalsBasic()
    this.logger.log('arrival_basic entries deleted successfully');
    return;
  }    
  
  @Admin()
  @Delete('delete_matching_invalid_arrivals')
  async deleteMatchingArrivalsBasic(@Body() elements: ArrivalBasicModifyElementDto[]) {
    if (await this.taskStatus.isTaskRunning("migrating")) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Database is temporarily busy with a maintenance task. Please retry later.',
        retryAfter: 3600,
      });  
    }
    this.logger.log('deleting invalid arrival_basic entries');
    await this.basicService.deleteMatchingArrivalsBasic(elements)
    this.logger.log('arrival_basic entries deleted successfully');
    return;
  }  
  
  @Admin()
  @Post('set_valid_matching_invalid_arrivals')
  async setValidMatchingArrivalsBasic(@Body() elements: ArrivalBasicModifyElementDto[]) {
    this.logger.log('setting arrival_basic entries valid');
    await this.basicService.setValidMatchingArrivalsBasic(elements)
    this.logger.log('arrival_basic entries set valid successfully');
    return;
  }   

  @Admin()
  @Get('daily_services')
  async getDailyServices(){
    this.logger.log('fetching active journey services');
    return await this.basicService.getDailyServices()
  }

  @Admin()
  @Delete('delete_old')
  async deleteOldBasicEntities(@Res() res: Response) {
    if ((await this.taskStatus.isTaskRunning("migrating")) || (await this.taskStatus.isTaskRunning("deleting"))) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Database is temporarily busy with a maintenance task. Please retry later.',
        retryAfter: 3600,
      });  
    }
    this.taskStatus.startTask("deleting")
    res.status(202).json({ message: 'Task accepted' });

    setImmediate(async () => {
      try {
        this.logger.log('deleting old basic entries');
        await this.basicService.deleteOldJourneyBasic()
        this.logger.log('old JourneyBasic deleted');
        await this.basicService.deleteOldStopBasic()
        this.logger.log('old StopBasic deleted');
        await this.basicService.deleteOldTimetableBasic()
        this.logger.log('old TimetablelBasic deleted');
        await this.basicService.deleteOldArrivalBasic()
        this.logger.log('old ArrivalBasic deleted');
        this.logger.log('all basic entries deleted successfully');
      } catch (error) {
        this.logger.error('Deletion failed', error);
        this.taskStatus.failTask("deleting")
        throw error
      }
    });
    this.taskStatus.endTask("deleting")
    return;
  }  

  @Admin()
  @Delete('scrub_basic')
  public scrubBasic() {
    return  this.basicService.scrubBasic()
  }
}