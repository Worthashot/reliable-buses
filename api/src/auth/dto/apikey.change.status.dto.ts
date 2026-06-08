import { IsNotEmpty } from 'class-validator';
import { PermissionLevel } from '../types/permission.enums';

export class ApiKeyChangeStatusDto {
  @IsNotEmpty()
  readonly key!: string;

  readonly name!: string;
  
  permissionLevel !: PermissionLevel

  @IsNotEmpty()
  isActive !: boolean

  createdAt !: Date
}