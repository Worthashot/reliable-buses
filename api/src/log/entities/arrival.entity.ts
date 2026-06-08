import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn} from 'typeorm';
import { LogEntity } from './log.entity';
import { Unique } from 'typeorm';

@Entity('arrivals')
@Unique(['trip_code', 'date', 'time', 'log'])  // Prevents duplicates
export class ArrivalEntity {
  @PrimaryGeneratedColumn()
  arrival_id!: number;

  @Column()
  trip_code!: number;

  @Column()
  date!: number;

  @Column()
  time!: number;

  @ManyToOne(() => LogEntity, log => log.arrivals, { nullable: false })
  @JoinColumn({name : "log_id"})
  log!: LogEntity;
}