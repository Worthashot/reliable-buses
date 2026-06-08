export interface Journey {
  journey_id: number;

  service : string;

  origin_name : string;

  origin_code : string;

  destination_name : string;

  destination_code : string;

  direction : string;

  valid_from : number;

  valid_to : number;

  date_added : number;

  date_modified : number;

  created_at: Date;

  count : number;   
}