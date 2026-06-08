
import { Controller, Get, Post, Req, Body, UseGuards, Delete, Logger } from '@nestjs/common';
import { ApiKeyEntity } from './entities/apikey.entity';
import { ApiKey } from './interfaces/api.interface';
import { AuthService } from './auth.service';
import { ApiKeyCacheItemDto } from './dto/apikey.cahe.item.dto';
import { ApiKeyCacheResponseDto } from './dto/apikey.cahe.response.dto';
import { Public, Private, Admin } from '../auth/decorators/permission.decorator'
import { ApiKeyNewDto } from './dto/apikey.new.dto';
import { ApiKeyDeleteDto } from './dto/apikey.delete.dto';
import { ApiKeyChangeStatusDto } from './dto/apikey.change.status.dto';

@Controller('auth')
export class AuthController {
  constructor (private authService: AuthService) {}
  private readonly logger = new Logger(AuthService.name);
  @Get("all_keys")
  @Admin()
  async get_all_api_keys() : Promise<ApiKeyCacheResponseDto> {
     const api_map: Map<string, ApiKeyEntity> = this.authService.cached_keys();

      const cacheArray: ApiKeyCacheItemDto[] = Array.from(api_map).map(([cacheKey, apiKey]) => ({
      cacheKey,
      id: apiKey.id,
      key: apiKey.key,
      name: apiKey.name,
      permissionLevel: apiKey.permissionLevel,
      isActive: apiKey.isActive,
      createdAt: apiKey.createdAt,
    }));

    return {
      count: cacheArray.length,
      keys: cacheArray,
    };
  }

  @Post("add_key")
  @Admin()
  async add_key(@Body() apiKeyNewDto: ApiKeyNewDto){
        this.authService.storeNewAPIKeys(apiKeyNewDto)
    }

  @Delete("remove_key")
  @Admin()
  async remove_key(@Body() apiKeyDeleteDto: ApiKeyDeleteDto){
      this.logger.log('Removing Api Key '.concat(apiKeyDeleteDto.key));
      this.authService.deleteApiKey(apiKeyDeleteDto)
    } 

  @Post("change_key_status")
  @Admin()
  async change_status(@Body() apiChangeStatusDto : ApiKeyChangeStatusDto){
    this.authService.changeApiKeyStatus(apiChangeStatusDto)
  }

  @Post("update_apikey_cache")
  @Admin()
  async set_live(){
    this.authService.loadLiveApiKeysIntoCache()
  }

}