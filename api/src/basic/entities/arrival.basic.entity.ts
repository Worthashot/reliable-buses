import { Entity, Column, PrimaryGeneratedColumn, Unique} from 'typeorm';

@Entity({name : 'arrivals_basic', schema : 'arrival_basic'})
@Unique(["service","origin","destination","time","date","bus_id","stop_id","count"])
export class ArrivalBasicEntity {
  @PrimaryGeneratedColumn()
  Index!: number;

  @Column()
  service!: string;

  @Column()
  origin!: string;

  @Column()
  destination!: string;

  @Column()
  date_added!: number;

  @Column()
  stop_id!: string;

  @Column()
  time!: number;

  @Column()
  date!: number;

  @Column()
  bus_id!: number;

  @Column()
  count!: number;

  @Column()
  valid!: number;
}