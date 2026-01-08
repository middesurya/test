/**
 * Rate Limiter with automatic cleanup to prevent memory leaks
 * Uses sliding window algorithm
 */

interface RateLimitEntry {
  count: number;
  reset: number;
}

const store = new Map<string, RateLimitEntry>();
const limit = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
const window = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);

// Cleanup interval (run every 60 seconds by default)
const CLEANUP_INTERVAL_MS = parseInt(process.env.RATE_LIMIT_CLEANUP_INTERVAL_MS || '60000', 10);

// Maximum entries before forcing cleanup (prevents unbounded growth)
const MAX_ENTRIES = parseInt(process.env.RATE_LIMIT_MAX_ENTRIES || '10000', 10);

/**
 * Check if a client is within rate limits
 * @param clientId - Unique identifier for the client (e.g., IP address)
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const entry = store.get(clientId);

  // Force cleanup if store grows too large
  if (store.size > MAX_ENTRIES) {
    cleanupExpiredEntries();
  }

  if (!entry || now > entry.reset) {
    store.set(clientId, { count: 1, reset: now + window });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Remove expired entries from the store
 * This prevents memory leaks from accumulating stale entries
 */
export function cleanupExpiredEntries(): number {
  const now = Date.now();
  let removed = 0;

  for (const [key, entry] of store) {
    if (now > entry.reset) {
      store.delete(key);
      removed++;
    }
  }

  return removed;
}

/**
 * Get current store size (for monitoring/debugging)
 */
export function getRateLimitStoreSize(): number {
  return store.size;
}

/**
 * Clear all entries (for testing)
 */
export function clearRateLimitStore(): void {
  store.clear();
}

/**
 * Get rate limit info for a client (for headers/debugging)
 */
export function getRateLimitInfo(clientId: string): {
  limit: number;
  remaining: number;
  reset: number;
} | null {
  const entry = store.get(clientId);
  if (!entry) {
    return { limit, remaining: limit, reset: Date.now() + window };
  }

  return {
    limit,
    remaining: Math.max(0, limit - entry.count),
    reset: entry.reset
  };
}

// Start periodic cleanup (only if not in test environment)
let cleanupInterval: NodeJS.Timeout | null = null;

export function startCleanupInterval(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    cleanupExpiredEntries();
  }, CLEANUP_INTERVAL_MS);

  // Ensure the interval doesn't prevent process exit
  cleanupInterval.unref();
}

export function stopCleanupInterval(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// Auto-start cleanup in non-test environments
if (process.env.NODE_ENV !== 'test') {
  startCleanupInterval();
}
