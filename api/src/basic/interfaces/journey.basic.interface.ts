export interface JourneyBasic {
  Index: number;
  service: string;
  route_section_name: string;
  direction: string;
  origin : string
  destination : string
  valid_from : number
  valid_to : number
  stop_list: string
  date_added: number
  date_modified: number
  entry_created_at: number;
  is_active: number;  
  origin_id: string;
  destination_id: string;
  validated: number;
  route_section_id: string;
  count : number 
}