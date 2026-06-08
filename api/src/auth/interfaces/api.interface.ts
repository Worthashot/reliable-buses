import { PermissionLevel } from '../types/permission.enums';

export interface ApiKey {
  key: string;
  name: string;
  permissionLevel : PermissionLevel
  isActive : boolean
  createdAt : Date
}