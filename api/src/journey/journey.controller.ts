import { Controller, Get, Post, Req, Body, UseGuards,Logger, Delete } from '@nestjs/common';
import { JourneyService } from './journey.service';
import { Admin, Public} from 'src/auth/decorators/permission.decorator';
import { JourneyArrivalTestDto } from './dto/journey.arrival.test.dto';
import { Query } from '@nestjs/common';

@Controller('journeys')
export class JourneyController {
    constructor (private journeyService: JourneyService) {}
    private readonly logger = new Logger(JourneyController.name);

    @Admin()
    @Get('table')
    async getTable() {
    this.logger.log('checking journeys table exists in database');
    await this.journeyService.createjourneysTable()
    this.logger.log('fetching journeys table');
    return this.journeyService.getTable()
    }

    @Public()
    @Get('arrival_test')
    async arrival_test(@Query() journeyArrivalTest : JourneyArrivalTestDto) {
    this.logger.log('testing_fetching');
    return await this.journeyService.arrival_test(journeyArrivalTest)
    }

    @Public()
    @Get('services')
    async services() {
    this.logger.log('fetching services');
    return await this.journeyService.fetch_services()
    }    

}