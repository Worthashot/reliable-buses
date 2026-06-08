import { Controller, Get, Post, Req, Body, UseGuards,Logger } from '@nestjs/common';
import { LogService } from './log.service';
import { Public, Private, Admin } from '../auth/decorators/permission.decorator'
import { LogAddElementDto } from './dto/log.add.element.dto';
import { GetHistogramDto } from './dto/log.get.histogram.dto';
import { Log } from './interfaces/log.interface';
import { Query} from '@nestjs/common';
import { GetTimeCountDto} from './dto/get.time.count.dto';
import type { LogGetArrivalImageDto } from './dto/log.get.arrival.image.dto';
import type { Response } from 'express';
import { Res } from '@nestjs/common';

@Controller('log')
export class LogController {
    constructor (private logService: LogService) {}
    private readonly logger = new Logger(LogController.name);

    @Admin()
    @Get('test_number_conversion')
    async testNumberConversion(){
        const testNumber = 100000
        return([this.getDate(testNumber), this.getTime(testNumber)])
    }

    @Admin()
    @Get('hist')
    async getHistogram(@Body() getHistogramDto : GetHistogramDto){
        try{
            return this.logService.createHistogram(getHistogramDto)
        } catch (error){
            return
        }

    }

    @Public()
    @Get('arrival_image')
    async getArrivalImage(@Query() getArrivalImageDto : LogGetArrivalImageDto,
                        @Res() res: Response,){

        this.logger.log('generating arrival image');
        this.logger.log('got ' + getArrivalImageDto.direction);
        this.logger.log('got ' + getArrivalImageDto.service);
        this.logger.log('got ' + getArrivalImageDto.stop_code);
        const imageBuffer = await this.logService.getArrivalImage(getArrivalImageDto);
        this.logger.log('image generated');
        res.setHeader('Content-Type', 'image/png');
        res.send(imageBuffer);

    }

    @Public()
    @Get('time_count')
    async getTimeCount(@Query() getTimeCountDto : GetTimeCountDto){
        this.logger.log('getting stop percent within time');
        this.logger.log('got ' + getTimeCountDto.direction);
        this.logger.log('got ' + getTimeCountDto.service);
        this.logger.log('got ' + getTimeCountDto.stop_code);
        this.logger.log('got ' + getTimeCountDto.time);
        return await this.logService.getTimeCount(getTimeCountDto)
    }

    private getDate(unixTime : number): number{
        const date = new Date(unixTime * 1000); 
        const year = date.toLocaleString('en-US', { timeZone: 'Europe/London', year: 'numeric' });
        const month = date.toLocaleString('en-US', { timeZone: 'Europe/London', month: '2-digit' });
        const day = date.toLocaleString('en-US', { timeZone: 'Europe/London', day: '2-digit' });
        return Number(`${year}${month}${day}`)
    }

    private  getTime(unixTime : number): any{
        const date = new Date(unixTime * 1000); 
        const hour = date.toLocaleString('en-US', { timeZone: 'Europe/London', hour: 'numeric', hour12: false });
        const minute = date.toLocaleString('en-US', { timeZone: 'Europe/London', minute: 'numeric' });
        const second = date.toLocaleString('en-US', { timeZone: 'Europe/London', second: 'numeric' });
        return (Number(hour)*60*60) + (Number(minute) * 60) + Number(second)
    }
}

