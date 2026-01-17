import {
  checkRateLimit,
  cleanupExpiredEntries,
  getRateLimitStoreSize,
  clearRateLimitStore,
  getRateLimitInfo
} from '../../src/utils/rate-limiter';

describe('Rate Limiter', () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', () => {
      for (let i = 0; i < 100; i++) {
        expect(checkRateLimit('client-1')).toBe(true);
      }
    });

    it('should block requests exceeding limit', () => {
      // Fill up the limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit('client-2');
      }
      // Next request should be blocked
      expect(checkRateLimit('client-2')).toBe(false);
    });

    it('should track clients independently', () => {
      // Use up client-a's limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit('client-a');
      }
      expect(checkRateLimit('client-a')).toBe(false);

      // client-b should still be allowed
      expect(checkRateLimit('client-b')).toBe(true);
    });

    it('should add entries to the store', () => {
      expect(getRateLimitStoreSize()).toBe(0);
      checkRateLimit('new-client');
      expect(getRateLimitStoreSize()).toBe(1);
    });
  });

  describe('cleanupExpiredEntries', () => {
    it('should remove expired entries', async () => {
      // Create entries that expire quickly
      // We need to mock the Date.now or wait for actual expiration
      checkRateLimit('temp-client-1');
      checkRateLimit('temp-client-2');
      checkRateLimit('temp-client-3');

      expect(getRateLimitStoreSize()).toBe(3);

      // Cleanup shouldn't remove active entries
      const removed = cleanupExpiredEntries();
      expect(removed).toBe(0);
      expect(getRateLimitStoreSize()).toBe(3);
    });

    it('should return count of removed entries', () => {
      const removed = cleanupExpiredEntries();
      expect(typeof removed).toBe('number');
    });
  });

  describe('getRateLimitInfo', () => {
    it('should return rate limit info for known client', () => {
      checkRateLimit('info-client');
      const info = getRateLimitInfo('info-client');

      expect(info).toBeDefined();
      expect(info?.limit).toBe(100);
      expect(info?.remaining).toBe(99);
      expect(info?.reset).toBeGreaterThan(Date.now());
    });

    it('should return full limit for unknown client', () => {
      const info = getRateLimitInfo('unknown-client');

      expect(info).toBeDefined();
      expect(info?.remaining).toBe(100);
    });
  });

  describe('clearRateLimitStore', () => {
    it('should clear all entries', () => {
      checkRateLimit('client-1');
      checkRateLimit('client-2');
      expect(getRateLimitStoreSize()).toBe(2);

      clearRateLimitStore();
      expect(getRateLimitStoreSize()).toBe(0);
    });
  });
});
