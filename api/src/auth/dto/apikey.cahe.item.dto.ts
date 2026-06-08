import { IsNotEmpty } from 'class-validator';
import { PermissionLevel } from '../types/permission.enums';

export class ApiKeyCacheItemDto {
  @IsNotEmpty()
  readonly key!: string;

  readonly name!: string;

  @IsNotEmpty()
  permissionLevel !: PermissionLevel

  isActive !: boolean

  createdAt? : Date
}

