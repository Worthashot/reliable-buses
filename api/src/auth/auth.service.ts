import { Injectable, OnModuleInit, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyEntity } from './entities/apikey.entity';
import { ApiKey } from './interfaces/api.interface';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PermissionLevel } from './types/permission.enums';

@Injectable()
export class AuthService implements OnApplicationBootstrap{
  private readonly logger = new Logger(AuthService.name);

  private apiKeyCache: Map<string, ApiKeyEntity> = new Map();
  private cacheLoaded: boolean = false;

  constructor(
    @InjectDataSource('live') 
    private liveDataSource: DataSource,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Application bootstrapped, loading API keys...');
    await this.loadApiKeysIntoCache();
  }

  private async loadApiKeysIntoCache(): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      const queryRunner = this.liveDataSource.createQueryRunner();
      try {
        this.logger.log(`Loading API keys from database (attempt ${retryCount + 1})...`);

        // Fetch only active API keys
    
        await queryRunner.connect();
        await queryRunner.startTransaction();
        const activeApiKeys = await queryRunner.query(
          'SELECT * FROM api_keys'
        );

        this.isApiKeyArray(activeApiKeys)


        // Clear existing cache
        this.apiKeyCache.clear();

        // Populate the cache
        let validKeyCount = 0;
        activeApiKeys.forEach(apiKey => {
          // Validate key format before caching
          // if (this.isValidApiKeyFormat(apiKey.key)) {
          this.apiKeyCache.set(apiKey.key, apiKey);
          validKeyCount++;
          // } else {
          //   this.logger.warn(`Skipping invalid API key format for key ID: ${apiKey.id}`);
          // }
        // });
        });

        this.cacheLoaded = true;
        await queryRunner.commitTransaction();
        this.logger.log(`✅ Successfully loaded ${validKeyCount} API keys into memory cache`);
        this.logger.debug(`Cache size: ${this.apiKeyCache.size} keys`);
        
        // Log some statistics
        // this.logCacheStatistics();
        return; // Success - exit retry loop

      } catch (error) {
        await queryRunner.rollbackTransaction();
        retryCount++;
        this.logger.error(`Failed to load API keys (attempt ${retryCount}/${maxRetries}):`, error.message);

        if (retryCount >= maxRetries) {
          this.logger.error('CRITICAL: All retries failed. Application cannot start without API keys.');
          throw new Error(`Failed to load API keys after ${maxRetries} attempts: ${error.message}`);
        }

        // Wait before retrying (exponential backoff)
        const waitTime = 1000 * retryCount;
        this.logger.log(`Retrying in ${waitTime}ms...`);
        await this.delay(waitTime);
      } finally{
        await queryRunner.release();
      }
    }
  }  

  // TODO validation
  async isValidApiKeyFormat(key: ApiKeyEntity): Promise<Boolean> {
    return true
  }

  async validateApiKey(key: string): Promise<ApiKey | null> {
    // Safety check - ensure cache is loaded
    if (!this.cacheLoaded) {
      this.logger.warn('API key cache not loaded yet, attempting to load...');
      await this.loadApiKeysIntoCache();
    }

    // Fast in-memory lookup
    const apiKey = this.apiKeyCache.get(key);
    
    if (!apiKey) {
      return null; // Key not found
    }

    // Check if key is still active (in case cache hasn't been refreshed)
    if (!apiKey.isActive) {
      this.apiKeyCache.delete(key); // Clean up cache
      return null;
    }


    return apiKey;
  }




  cached_keys(): Map<string, ApiKeyEntity>{
     return this.apiKeyCache;
  }

  async storeNewAPIKeys(apiKey : ApiKey): Promise<void>{
    this.logger.log('Storing New ApiKeys...');
    const queryRunner = this.liveDataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Insert into new database

      await queryRunner.query(
        `INSERT INTO api_keys (key, name, permissionLevel, isActive) 
          VALUES (?, ?, ?, ?)`,
        [
          apiKey.key, 
          apiKey.name, 
          apiKey.permissionLevel, 
          apiKey.isActive, 
        ]
      );
      await queryRunner.commitTransaction();
    

      this.logger.log('✅ API keys stored successfully');
      
    } catch (error) {
      this.logger.error('Failed to store API keys:', error);
      queryRunner.rollbackTransaction();
    } finally{
      await queryRunner.release();
    }        
  }


  async loadLiveApiKeysIntoCache(): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;
    const queryRunner = this.liveDataSource.createQueryRunner();
    await queryRunner.connect();
    while (retryCount < maxRetries) {
      try {
        this.logger.log(`Loading API keys from database (attempt ${retryCount + 1})...`);


        await queryRunner.startTransaction();
        const activeApiKeys = await queryRunner.query(`
          SELECT * FROM api_keys WHERE isActive = 1;
          )
        `);     
        await queryRunner.commitTransaction();   

        // Clear existing cache
        this.apiKeyCache.clear();

        // Populate the cache
        let validKeyCount = 0;
        activeApiKeys.forEach(apiKey => {
          this.apiKeyCache.set(apiKey.key, apiKey);
          validKeyCount++;
        });

        this.cacheLoaded = true;
        
        this.logger.log(`✅ Successfully loaded ${validKeyCount} API keys into memory cache`);
        this.logger.debug(`Cache size: ${this.apiKeyCache.size} keys`);
        
        // Log some statistics
        // this.logCacheStatistics();
        return; // Success - exit retry loop

      } catch (error) {
        retryCount++;
        this.logger.error(`Failed to load API keys (attempt ${retryCount}/${maxRetries}):`, error.message);
        await queryRunner.rollbackTransaction();

        if (retryCount >= maxRetries) {
          this.logger.error('CRITICAL: All retries failed. Application cannot start without API keys.');
          throw new Error(`Failed to load API keys after ${maxRetries} attempts: ${error.message}`);
        }

        // Wait before retrying (exponential backoff)
        const waitTime = 1000 * retryCount;
        this.logger.log(`Retrying in ${waitTime}ms...`);
        await this.delay(waitTime);
      } 
    }
    await queryRunner.release();
  }  
  async deleteApiKey(apiKey: ApiKey): Promise<void>{
    this.logger.log('Deleting ApiKey...');
    const queryRunner = this.liveDataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();

      // Insert into new database

      await queryRunner.query(
        'DELETE FROM api_keys WHERE key = ?',
        [
          apiKey.key
        ]
      );
    
      await queryRunner.commitTransaction();
      this.logger.log('✅ API keys deleted successfully');
      
    } catch (error) {
      this.logger.error('Failed to delete API keys:', error);
      await queryRunner.rollbackTransaction();
    } finally{
      await queryRunner.release();
    }        
  }

  async changeApiKeyStatus(apiKey : ApiKey) : Promise<void>{
    this.logger.log('changing ApiKeys Status...');

    const queryRunner = this.liveDataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();

      // Insert into new database

      await queryRunner.query(
        `UPDATE api_keys 
         SET isActive = ?
         WHERE key = ?`,
        [
          apiKey.isActive,
          apiKey.key
        ]
      );
    
      await queryRunner.commitTransaction();
      this.logger.log('✅ API key status changed successfully');
      
    } catch (error) {
      this.logger.error('Failed to change API key status:', error);
      await queryRunner.rollbackTransaction();
    }  finally{
      await queryRunner.release();
    }          
  }


  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // private logCacheStatistics(): void {
  //  const stats = this.getCacheStats();
  //  this.logger.log(`API Key Cache Statistics: ${stats.totalKeys} keys, ${stats.expiredKeysInCache} expired`);
  // }

  private isPermissionLevel(sample:any): sample is PermissionLevel{
    return (
      sample === 'PUBLIC' || sample === "PRIVATE" || sample === "ADMIN"
    );
  }

  private isApiKey(sample: any): sample is ApiKey {
    return (
      sample !== null &&
      sample !== undefined &&
      typeof sample === 'object' &&
      typeof sample.key === 'string' &&
      typeof sample.name === 'string' &&
      this.isPermissionLevel(sample.permissionLevel) &&
      typeof sample.isActive === 'boolean' &&
      sample.createdAt instanceof  Date
    );
  }

  private isApiKeyArray(sample : any): sample is ApiKey[] {
    if (!Array.isArray(sample)) {
      return false;
    }

    // Check each element in the array
    return sample.every(item => 
      this.isApiKey(item)
    );
  }

}

