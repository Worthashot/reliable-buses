import { Journey } from "../interfaces/journey";

export class JourneyGetTableItemDto {
  service: string;
  route_section_name: string;
  direction: string;
  origin : string
  destination : string
  valid_from : number
  valid_to : number
  date_added: number
  date_modified: number 
  origin_id: string;
  destination_id: string;
  route_section_id: string;
  count : number ;
  stop_list : string ; 
  entry_created_at: number ;

  constructor(item: Journey, stop_list: string) {
    this.service = item.service;
    this.route_section_name = item.service + ":" + item.origin_name + " - " + item.destination_name +":" + item.count
    this.direction = item.direction
    this.origin = item.origin_name
    this.destination = item.destination_name
    this.valid_from = item.valid_from
    this.valid_to = item.valid_to
    this.date_added = item.date_added
    this.date_modified = item.date_modified
    this.origin_id = item.origin_code
    this.destination_id = item.destination_code
    this.route_section_id = item.origin_code + ":" + item.destination_code
    this.count = item.count
    this.stop_list = stop_list
    this.entry_created_at = Math.floor(item.created_at.getTime() / 1000)
  }
}