import { Controller, Post, Query, Body } from '@nestjs/common';
import { MailService } from './mail.service';
import { Logger } from '@nestjs/common';
import { Public, Private, Admin } from '../auth/decorators/permission.decorator'
import { SendErrorEmailDto } from './dto/send.error.email.dto';

@Controller('mail')
export class MailController {
  private readonly logger = new Logger(MailController.name);
  constructor(private readonly mailService: MailService) {}

  @Admin()
  @Post('send_test_email')
  async sendTestEmail(@Query('subject') subject: string, @Query('message') message: string) {
    await this.mailService.sendEmail(subject, message);
    this.logger.log('Test email sent with subkect ' + subject + ' and message ' + message);
  }

  @Admin()
  @Post('send_error_email')
  async sendErrorEmail(@Body() sendErrorEmailDto: SendErrorEmailDto) {
    await this.mailService.sendEmail(
      sendErrorEmailDto.subject,
      sendErrorEmailDto.content
    );
    this.logger.log('Test email sent with subkect ' + sendErrorEmailDto.subject + ' and message ' + sendErrorEmailDto.content);
  }
}
