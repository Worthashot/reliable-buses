import { IsNotEmpty } from 'class-validator';
import { PermissionLevel } from '../types/permission.enums';

export class ApiKeyDeleteDto {

  @IsNotEmpty()
  readonly key!: string;

  readonly name!: string;

  permissionLevel !: PermissionLevel

  isActive !: boolean

  createdAt !: Date
}