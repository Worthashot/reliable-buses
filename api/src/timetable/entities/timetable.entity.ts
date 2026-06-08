import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn} from 'typeorm';
import { TimetableInformationEntity } from './timetable_information_entity';
import { Unique } from 'typeorm';

@Entity({name : 'timetables', schema : 'timetables'})
@Unique(["timetable_information","time"])
export class TimetableEntity {
  @PrimaryGeneratedColumn()
  timetable_id!: number;

  @Column()
  time!: number;

  @ManyToOne(() => TimetableInformationEntity, timetable_information => timetable_information.timetables, { nullable: false })
  @JoinColumn({name : "timetable_information_id"})
  timetable_information!: TimetableInformationEntity;
}            