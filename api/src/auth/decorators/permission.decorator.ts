import { SetMetadata } from '@nestjs/common';
import { PermissionLevel } from '../types/permission.enums';

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';
export const RequiredPermission = (level: PermissionLevel) => 
  SetMetadata(REQUIRED_PERMISSION_KEY, level);

export const Public = () => RequiredPermission(PermissionLevel.PUBLIC);
export const Private = () => RequiredPermission(PermissionLevel.PRIVATE);
export const Admin = () => RequiredPermission(PermissionLevel.ADMIN);