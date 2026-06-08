import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Unique } from 'typeorm';
@Entity({name : 'journeys_basic', schema : 'journey_basic'})
@Unique(['service', 'origin', 'destination', 'date_modified', 'count'])
export class JourneyBasicEntity {
  @PrimaryGeneratedColumn()
  Index!: number;

  @Column()
  service!: string;

  @Column()
  route_section_name!: string;

  @Column()
  direction!: string;

  @Column()
  origin! : string

  @Column()
  destination! : string

  @Column()
  valid_from! : number

  @Column()
  valid_to! : number

  @Column()
  stop_list!: string

  @Column()
  date_added!: number

  @Column()
  date_modified!: number

  @Column()
  entry_created_at!: number;

  @Column()
  is_active!: number;  

  @Column()
  origin_id!: string;

  @Column()
  destination_id!: string;

  @Column()
  validated!: number;

  @Column()
  route_section_id!: string;

  @Column()
  count! : number 

}