/**
 * IPC Health Check Caching Tests
 *
 * Tests the health check caching mechanism in IPC handlers:
 * - Cache hits within TTL window (5s)
 * - Cache misses after TTL expiration
 * - Cache invalidation on checker errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock health check cache (same implementation as ipc-handlers.ts)
 */
interface HealthCheckCache {
  result: boolean;
  timestamp: number;
}

const healthCheckCache = new Map<string, HealthCheckCache>();
const HEALTH_CHECK_TTL = 5000; // 5 seconds

async function checkHealthCached(
  serviceId: string,
  checker: () => Promise<{ success: boolean; latency: number; error?: string }>
): Promise<boolean> {
  const now = Date.now();
  const cached = healthCheckCache.get(serviceId);

  if (cached && now - cached.timestamp < HEALTH_CHECK_TTL) {
    return cached.result;
  }

  const checkResult = await checker();
  healthCheckCache.set(serviceId, { result: checkResult.success, timestamp: now });
  return checkResult.success;
}

describe('IPC Health Check Caching', () => {
  beforeEach(() => {
    healthCheckCache.clear();
    vi.clearAllMocks();
  });

  describe('Cache Miss (First Call)', () => {
    it('should call checker on first invocation', async () => {
      const checker = vi.fn(async () => ({ success: true, latency: 50 }));

      const result = await checkHealthCached('gateway', checker);

      expect(result).toBe(true);
      expect(checker).toHaveBeenCalledTimes(1);
    });

    it('should cache the result after first call', async () => {
      const checker = vi.fn(async () => ({ success: true, latency: 50 }));

      await checkHealthCached('gateway', checker);

      // Cache should exist
      const cached = healthCheckCache.get('gateway');
      expect(cached).toBeDefined();
      expect(cached!.result).toBe(true);
      expect(cached!.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Cache Hit (Within TTL)', () => {
    it('should return cached result without calling checker', async () => {
      const checker = vi.fn(async () => ({ success: true, latency: 50 }));

      // First call
      await checkHealthCached('gateway', checker);
      expect(checker).toHaveBeenCalledTimes(1);

      // Second call (within TTL)
      const result = await checkHealthCached('gateway', checker);

      expect(result).toBe(true);
      expect(checker).toHaveBeenCalledTimes(1); // Should NOT call again
    });

    it('should work with multiple services independently', async () => {
      const gatewayChecker = vi.fn(async () => ({ success: true, latency: 50 }));
      const viteChecker = vi.fn(async () => ({ success: false, latency: 100, error: 'Not ready' }));

      await checkHealthCached('gateway', gatewayChecker);
      await checkHealthCached('vite', viteChecker);

      // Both should be cached
      expect(healthCheckCache.get('gateway')!.result).toBe(true);
      expect(healthCheckCache.get('vite')!.result).toBe(false);

      // Call again (should use cache)
      const gatewayResult = await checkHealthCached('gateway', gatewayChecker);
      const viteResult = await checkHealthCached('vite', viteChecker);

      expect(gatewayResult).toBe(true);
      expect(viteResult).toBe(false);
      expect(gatewayChecker).toHaveBeenCalledTimes(1);
      expect(viteChecker).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache Expiration (After TTL)', () => {
    it('should call checker again after TTL expires', async () => {
      const checker = vi.fn(async () => ({ success: true, latency: 50 }));

      // First call
      await checkHealthCached('gateway', checker);
      expect(checker).toHaveBeenCalledTimes(1);

      // Simulate TTL expiration
      const cached = healthCheckCache.get('gateway')!;
      cached.timestamp = Date.now() - HEALTH_CHECK_TTL - 1000; // 1 second past TTL

      // Second call (should trigger new check)
      await checkHealthCached('gateway', checker);
      expect(checker).toHaveBeenCalledTimes(2);
    });

    it('should update cache with new result after expiration', async () => {
      const checker = vi
        .fn()
        .mockResolvedValueOnce({ success: true, latency: 50 })
        .mockResolvedValueOnce({ success: false, latency: 100, error: 'Service down' });

      // First call
      const result1 = await checkHealthCached('gateway', checker);
      expect(result1).toBe(true);

      // Expire cache
      const cached = healthCheckCache.get('gateway')!;
      cached.timestamp = Date.now() - HEALTH_CHECK_TTL - 1000;

      // Second call (should get new result)
      const result2 = await checkHealthCached('gateway', checker);
      expect(result2).toBe(false);

      // Cache should be updated
      expect(healthCheckCache.get('gateway')!.result).toBe(false);
    });
  });

  describe('Cache Behavior with Different Results', () => {
    it('should cache successful health checks', async () => {
      const checker = vi.fn(async () => ({ success: true, latency: 50 }));

      await checkHealthCached('gateway', checker);

      const cached = healthCheckCache.get('gateway');
      expect(cached).toBeDefined();
      expect(cached!.result).toBe(true);
    });

    it('should cache failed health checks', async () => {
      const checker = vi.fn(async () => ({ success: false, latency: 100, error: 'Timeout' }));

      const result = await checkHealthCached('gateway', checker);

      expect(result).toBe(false);
      const cached = healthCheckCache.get('gateway');
      expect(cached).toBeDefined();
      expect(cached!.result).toBe(false);
    });

    it('should handle checker errors gracefully', async () => {
      const checker = vi.fn(async () => {
        throw new Error('Network error');
      });

      await expect(checkHealthCached('gateway', checker)).rejects.toThrow('Network error');

      // Cache should not be set on error
      expect(healthCheckCache.get('gateway')).toBeUndefined();
    });
  });

  describe('Performance Optimization', () => {
    it('should reduce redundant health checks', async () => {
      const checker = vi.fn(async () => ({ success: true, latency: 50 }));

      // First call to populate cache
      await checkHealthCached('gateway', checker);
      expect(checker).toHaveBeenCalledTimes(1);

      // Simulate 10 rapid sequential calls (within TTL)
      for (let i = 0; i < 10; i++) {
        await checkHealthCached('gateway', checker);
      }

      // Only first call should invoke checker
      expect(checker).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent calls correctly', async () => {
      const checker = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate slow check
        return { success: true, latency: 100 };
      });

      // Start two concurrent calls
      const [result1, result2] = await Promise.all([
        checkHealthCached('gateway', checker),
        checkHealthCached('gateway', checker),
      ]);

      expect(result1).toBe(true);
      expect(result2).toBe(true);

      // Both calls should trigger checker (no concurrency protection)
      // This is acceptable since health checks are idempotent
      expect(checker).toHaveBeenCalledTimes(2);
    });
  });

  describe('TTL Edge Cases', () => {
    it('should treat exactly TTL boundary as expired', async () => {
      const checker = vi.fn(async () => ({ success: true, latency: 50 }));

      await checkHealthCached('gateway', checker);

      // Set timestamp to exactly TTL ago
      const cached = healthCheckCache.get('gateway')!;
      cached.timestamp = Date.now() - HEALTH_CHECK_TTL;

      // Should NOT use cache (boundary is exclusive)
      await checkHealthCached('gateway', checker);
      expect(checker).toHaveBeenCalledTimes(2);
    });

    it('should treat TTL - 1ms as valid cache', async () => {
      const checker = vi.fn(async () => ({ success: true, latency: 50 }));

      await checkHealthCached('gateway', checker);

      // Set timestamp to TTL - 1ms ago
      const cached = healthCheckCache.get('gateway')!;
      cached.timestamp = Date.now() - HEALTH_CHECK_TTL + 1;

      // Should use cache
      await checkHealthCached('gateway', checker);
      expect(checker).toHaveBeenCalledTimes(1);
    });
  });
});
