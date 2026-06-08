import { ManyToMany, Entity, Column, PrimaryGeneratedColumn, OneToMany, Unique, CreateDateColumn, JoinTable } from 'typeorm';
import { LogEntity } from 'src/log/entities/log.entity';
import { JourneyEntity } from 'src/journey/entities/journey.entity';

@Entity('stops')
@Unique(["stop_code", "date_modified"])
export class StopEntity {
  @PrimaryGeneratedColumn()
  stop_id!: number;

  @Column()
  stop_name!: string;

  @Column()
  stop_code!: number;

  @Column()
  latitude !: number;

  @Column()
  longitude !: number;

  @CreateDateColumn({ type: 'datetime' }) // Maps to SQLite 'datetime' type
  created_at!: Date;

  @Column()
  date_modified!: number;

  @ManyToMany(() => JourneyEntity, journeyEntity => journeyEntity.stops)
  @JoinTable({
    name :"log",
    joinColumn: {name :'stops'},
    inverseJoinColumn : {name : 'journeys'}
  })
  journeys !: JourneyEntity[]

  @OneToMany(() => LogEntity, log => log.stop)
  logs!: LogEntity[];
}