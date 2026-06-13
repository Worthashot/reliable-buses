import { Logger } from '@nestjs/common';

export async function retryOnBusy<T>(
  operation: () => Promise<T>,
  maxRetries = 5,
  baseDelayMs = 100,
  logger?: Logger,
): Promise<T> {
  let lastError: Error = new Error('Max retries exceeded');
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      // Check for SQLITE_BUSY (error code 5 or message includes "SQLITE_BUSY")
      if (error.code === 'SQLITE_BUSY' || error.message?.includes('SQLITE_BUSY')) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        if (logger) {
          logger.warn(`Database busy (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}