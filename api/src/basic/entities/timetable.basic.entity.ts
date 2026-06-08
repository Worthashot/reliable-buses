import { Entity, Column, PrimaryGeneratedColumn, Unique} from 'typeorm';
import { CreateDateColumn } from 'typeorm';

@Entity({name : 'timetables_basic', schema : 'timetables_basic'})
@Unique(["origin_id","destination_id","name","service","stop_id","time","created_at","count"])
export class TimetableBasicEntity {
  @PrimaryGeneratedColumn()
  index!: number;

  @Column()
  origin_id!: string;

  @Column()
  destination_id!: string;

  @Column()
  name!: string;

  @Column()
  service!: number;

  @Column()
  stop_id!: string;

  @Column()
  time!: number;

  @CreateDateColumn({ type: 'datetime' }) 
  created_at!: Date;

  @Column()
  is_active!: number;

  @Column()
  count!: number;  
}