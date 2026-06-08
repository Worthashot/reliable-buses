import { IsNotEmpty } from 'class-validator';


export class LogAddElementDto {
  id?: number;

  @IsNotEmpty()
  trip_id!: string[];

  @IsNotEmpty()
  journey_id!: string;

  @IsNotEmpty()
  stop_id!: string;

  @IsNotEmpty()
  time!: number[];

  @IsNotEmpty()
  date!: number[];  
}
