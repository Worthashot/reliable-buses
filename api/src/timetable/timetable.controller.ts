import { Controller, Get, Post, Delete, Req, Body, UseGuards,Logger } from '@nestjs/common';
import { TimetableService } from './timetable.service';
import { Admin, Public } from 'src/auth/decorators/permission.decorator';

@Controller('basic')
export class TimetableController {
    constructor (private basicService: TimetableService) {}
    private readonly logger = new Logger(TimetableController.name);
}