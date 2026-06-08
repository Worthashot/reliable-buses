import { IsNotEmpty, IsOptional } from 'class-validator';


export class GetHistogramDto {
  @IsNotEmpty()
  journeyId!: string;

  @IsNotEmpty()
  stopId!: number;

  @IsOptional()
  timeRangeStart: number = (11*60*60);  

  @IsOptional()
  timeRangeEnd: number = (13*60*60);    
}