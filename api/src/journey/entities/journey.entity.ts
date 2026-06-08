import { ManyToMany, Entity, Column, PrimaryGeneratedColumn, Unique, OneToMany, CreateDateColumn } from 'typeorm';
import { LogEntity } from 'src/log/entities/log.entity';
import { StopEntity } from 'src/stop/entities/stop.entity';

@Entity('journeys')
@Unique(['service', 'origin_code', 'destination_code', 'date_modified', 'count'])
export class JourneyEntity {
  @PrimaryGeneratedColumn()
  journey_id!: number;

  @Column()
  service! : string;

  @Column()
  origin_name! : string;

  @Column()
  origin_code! : string;

  @Column()
  destination_name! : string;

  @Column()
  destination_code! : string;

  @Column()
  direction! : string;

  @Column()
  valid_from !: number;

  @Column()
  valid_to !: number;

  @Column()
  date_added !: number;

  @Column()
  date_modified !: number;

  @CreateDateColumn({ type: 'datetime' }) 
  created_at!: Date;

  @Column()
  count! : number;   

  @Column()
  valid!: number;

  @ManyToMany(() => StopEntity, stopEntity => stopEntity.journeys)
  stops!: StopEntity[]

  @OneToMany(() => LogEntity, log => log.journey)
  logs!: LogEntity[];
}