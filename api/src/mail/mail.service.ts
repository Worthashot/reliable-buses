import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
    private readonly recipient: string;

    constructor(
        private mailerService: MailerService,
        private configService: ConfigService,
      ) {
        this.recipient = this.configService.get<string>('EMAIL_TO')!;
      }

    private readonly logger = new Logger(MailerService.name);

    async sendEmail(subject: string, message: string) {
      await this.mailerService.sendMail({
        to: this.recipient,   // always your own email
        subject: subject,
        text: message,        // or HTML content
        // html: `<p>${message}</p>`,
      });
  }



}
