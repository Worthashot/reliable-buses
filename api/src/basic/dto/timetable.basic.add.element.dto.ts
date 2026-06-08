
export class TimetableBasicAddElementDto {
  origin_id!: string;
  destination_id!: string;
  name!: string;
  service!: number;
  stop_id!: string;
  time!: number;
  count!: number;  
  is_active!: number;
}