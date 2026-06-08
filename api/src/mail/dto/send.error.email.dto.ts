import { IsNotEmpty } from 'class-validator';


export class SendErrorEmailDto {
  @IsNotEmpty()
  subject!: string;

  @IsNotEmpty()
  content!: string;
}