import { logger } from './logger';

export function auditLog(action: string, entry?: Record<string, unknown>): void {
  logger.info({ audit: true, action, ...entry }, 'Audit event');
}
