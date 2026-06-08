
import { JoinColumn, Entity, Column, PrimaryGeneratedColumn, Unique, ManyToOne, OneToMany, CreateDateColumn} from 'typeorm';
import { StopEntity } from "src/stop/entities/stop.entity";
import { JourneyEntity } from "src/journey/entities/journey.entity";
import { ArrivalEntity } from './arrival.entity';
import { TimetableInformationEntity } from 'src/timetable/entities/timetable_information_entity';
@Entity('logs')
@Unique(['stop', 'journey'])  // Prevents duplicates
export class LogEntity {
  @PrimaryGeneratedColumn()
  log_id!: number;

  @Column()
  timetable_count!: number

  @Column({ type: 'integer', nullable: true })
  stop_sequence!: number;  // The order the stop is in the route of the journey of this entry

  @CreateDateColumn({ type: 'datetime' }) // Maps to SQLite 'datetime' type
  created_at!: Date;

  @CreateDateColumn({ type: 'datetime' }) // Maps to SQLite 'datetime' type
  updated_at!: Date;

  @ManyToOne(() => StopEntity, busStop => busStop.logs, { 
    nullable: false,
    onDelete: 'CASCADE'
   })
  @JoinColumn({name : "stop_id"})
  stop!: StopEntity;

  @ManyToOne(() => JourneyEntity, journey => journey.logs, { 
    nullable: false,
    onDelete: 'CASCADE'
   })
  @JoinColumn({name : "journey_id"})
  journey!: JourneyEntity;

  @OneToMany(() => ArrivalEntity, arrival => arrival.log)
  arrivals!: ArrivalEntity[];

  @OneToMany(() => TimetableInformationEntity, timetable_information => timetable_information.log)
  timetable_information!: TimetableInformationEntity[];
}