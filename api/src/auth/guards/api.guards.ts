import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { PermissionLevel } from '../types/permission.enums'
import { REQUIRED_PERMISSION_KEY } from '../decorators/permission.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.get<PermissionLevel>(
      REQUIRED_PERMISSION_KEY, 
      context.getHandler()
    ) ?? PermissionLevel.ADMIN; // Default to admin if not specified

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new ForbiddenException('API key required');
    }

    const keyData = await this.authService.validateApiKey(apiKey);
    if (!keyData) {
      throw new ForbiddenException('Invalid API key');
    }

    // Simple permission check - expand this logic as needed
    if (!this.hasPermission(keyData.permissionLevel, requiredPermission)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Attach key info for use in controllers
    request.apiKey = keyData;
    return true;
  }

  private hasPermission(userLevel: PermissionLevel, requiredLevel: PermissionLevel): boolean {
    const hierarchy = {
      [PermissionLevel.PUBLIC]: 1,
      [PermissionLevel.PRIVATE]: 2, 
      [PermissionLevel.ADMIN]: 3
    };

    return hierarchy[userLevel] >= hierarchy[requiredLevel];
  }
}
