import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { PermissionLevel } from '../types/permission.enums';


@Entity('api_keys')
export class ApiKeyEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  key!: string;

  @Column()
  name!: string;

  @Column({
    type: 'text',
    enum: PermissionLevel,
    default: PermissionLevel.PUBLIC
  })
  permissionLevel!: PermissionLevel;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}