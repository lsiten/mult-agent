/**
 * Gateway Authentication Integration Tests
 *
 * Tests the Gateway auth middleware behavior:
 * - Production mode: Requires Bearer token
 * - Development mode: Bypasses auth
 * - /health endpoint: Always accessible
 */

import { describe, it, expect, beforeAll } from 'vitest';

const GATEWAY_URL = 'http://127.0.0.1:8642';

/**
 * Prerequisites:
 * - Gateway must be running on port 8642
 * - Set NODE_ENV=production for auth tests
 * - Set GATEWAY_AUTH_TOKEN environment variable
 */

describe('Gateway Authentication (Integration)', () => {
  let authToken: string | undefined;

  beforeAll(() => {
    authToken = process.env.GATEWAY_AUTH_TOKEN;
    console.log('[Test] NODE_ENV:', process.env.NODE_ENV);
    console.log('[Test] Auth token present:', !!authToken);
  });

  describe('Health Endpoint', () => {
    it('should allow /health without authentication', async () => {
      const response = await fetch(`${GATEWAY_URL}/health`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('status');
    });

    it('should allow /health with invalid token', async () => {
      const response = await fetch(`${GATEWAY_URL}/health`, {
        headers: {
          'Authorization': 'Bearer invalid-token-12345'
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('status');
    });
  });

  describe('Protected Endpoints (Production Mode)', () => {
    // Skip these tests if not in production mode or no token
    const isProduction = process.env.NODE_ENV === 'production';
    const hasToken = !!authToken;

    it.skipIf(!isProduction || !hasToken)('should reject requests without Authorization header (401)', async () => {
      const response = await fetch(`${GATEWAY_URL}/api/v1/sessions`);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toMatch(/authorization/i);
    });

    it.skipIf(!isProduction || !hasToken)('should reject requests with invalid token (403)', async () => {
      const response = await fetch(`${GATEWAY_URL}/api/v1/sessions`, {
        headers: {
          'Authorization': 'Bearer wrong-token-xyz'
        }
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toMatch(/forbidden|invalid/i);
    });

    it.skipIf(!isProduction || !hasToken)('should accept requests with valid token (200)', async () => {
      if (!authToken) {
        throw new Error('GATEWAY_AUTH_TOKEN not set');
      }

      const response = await fetch(`${GATEWAY_URL}/api/v1/sessions`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      // Should succeed (200 or 2xx status)
      expect(response.ok).toBe(true);
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
    });
  });

  describe('Development Mode', () => {
    const isDevelopment = process.env.NODE_ENV !== 'production';

    it.skipIf(!isDevelopment)('should allow requests without auth in development', async () => {
      const response = await fetch(`${GATEWAY_URL}/api/v1/sessions`);

      // Development mode bypasses auth
      expect(response.ok).toBe(true);
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });

    it.skipIf(!isDevelopment)('should allow requests with any token in development', async () => {
      const response = await fetch(`${GATEWAY_URL}/api/v1/sessions`, {
        headers: {
          'Authorization': 'Bearer any-token-works'
        }
      });

      // Development mode ignores token
      expect(response.ok).toBe(true);
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });

  describe('Token Format Validation', () => {
    const isProduction = process.env.NODE_ENV === 'production';

    it.skipIf(!isProduction)('should reject malformed Authorization header', async () => {
      const response = await fetch(`${GATEWAY_URL}/api/v1/sessions`, {
        headers: {
          'Authorization': 'Basic some-token' // Wrong scheme
        }
      });

      expect(response.status).toBe(401);
    });

    it.skipIf(!isProduction)('should reject token without Bearer prefix', async () => {
      const response = await fetch(`${GATEWAY_URL}/api/v1/sessions`, {
        headers: {
          'Authorization': 'some-token' // Missing "Bearer"
        }
      });

      expect(response.status).toBe(401);
    });
  });

  describe('CORS with Authentication', () => {
    it('should include CORS headers in auth responses', async () => {
      const response = await fetch(`${GATEWAY_URL}/api/v1/sessions`, {
        headers: {
          'Origin': 'http://localhost:5173'
        }
      });

      // CORS headers should be present even on auth failures
      expect(response.headers.has('access-control-allow-origin')).toBe(true);
    });
  });
});
