import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn} from 'typeorm';
import { Unique } from 'typeorm';
import { CreateDateColumn } from 'typeorm';
import { LogEntity } from 'src/log/entities/log.entity';
import { TimetableEntity } from './timetable.entity';
import { OneToMany } from 'typeorm';
@Entity({name : 'timetables_information', schema : 'timetables_information'})
@Unique(["log","day", "values_hash"])
export class TimetableInformationEntity {
  @PrimaryGeneratedColumn()
  timetable_information_id!: number;

  @CreateDateColumn({ type: 'datetime' }) 
  date_valid_on!: Date;

  @Column()
  daily_times_count!: number;

  @Column()
  day!: string;
  
  @Column({ type: 'varchar' })
  values_hash!: string;

  @ManyToOne(() => LogEntity, log => log.timetable_information, { nullable: false })
  @JoinColumn({name : "log_id"})
  log!: LogEntity;

  @OneToMany(() => TimetableEntity, timetables => timetables.timetable_information)
  timetables!: TimetableEntity[];  
} 


