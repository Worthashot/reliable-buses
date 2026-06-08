import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { LogEntity } from 'src/log/entities/log.entity';
import { Unique } from 'typeorm';

@Entity({name : 'stops_basic', schema : 'stop_basic'})
@Unique(['ATCOCode','CommonName','Longitude','Latitude','ModificationDateTime'])
export class StopBasicEntity {
  @PrimaryGeneratedColumn()
  Index!: number;

  @Column()
  ATCOCode!: string;

  @Column()
  CommonName!: string;

  @Column()
  Longitude!: number;

  @Column()
  Latitude! : number

  @Column()
  ModificationDateTime! : number
}