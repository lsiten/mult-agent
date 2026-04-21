/**
 * Parallel Service Startup Integration Tests
 *
 * Tests the layered parallel startup optimization:
 * - Services are organized into dependency layers
 * - Services within the same layer start concurrently
 * - Layers execute sequentially (wait for previous layer)
 * - Total time is less than sequential startup
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Application } from '../../src/core/application';
import type { Service, ServiceState } from '../../src/core/service.interface';

/**
 * Mock service that records start timestamps
 */
class TimestampService implements Service {
  id: string;
  dependencies: string[];
  required: boolean;
  private state: ServiceState = 'stopped';
  public startTime: number | null = null;
  public startDuration: number;

  constructor(
    id: string,
    dependencies: string[] = [],
    required: boolean = true,
    startDuration: number = 100
  ) {
    this.id = id;
    this.dependencies = dependencies;
    this.required = required;
    this.startDuration = startDuration;
  }

  async start(): Promise<void> {
    this.startTime = Date.now();
    await new Promise((resolve) => setTimeout(resolve, this.startDuration));
    this.state = 'started';
    console.log(`[Test] ${this.id} started at ${this.startTime}`);
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    this.startTime = null;
  }

  isHealthy(): boolean {
    return this.state === 'started';
  }

  getState(): ServiceState {
    return this.state;
  }
}

describe('Parallel Service Startup (Integration)', () => {
  let app: Application;

  beforeEach(() => {
    app = new Application();
  });

  describe('Layer Computation', () => {
    it('should compute correct layers for linear dependencies', async () => {
      // A → B → C (3 layers)
      const serviceA = new TimestampService('A', [], true, 50);
      const serviceB = new TimestampService('B', ['A'], true, 50);
      const serviceC = new TimestampService('C', ['B'], true, 50);

      app.register(serviceA);
      app.register(serviceB);
      app.register(serviceC);

      const startTime = Date.now();
      await app.start();
      const totalTime = Date.now() - startTime;

      // Verify order: A before B before C
      expect(serviceA.startTime).toBeLessThan(serviceB.startTime!);
      expect(serviceB.startTime).toBeLessThan(serviceC.startTime!);

      // Total time should be ~150ms (3 * 50ms sequential)
      expect(totalTime).toBeGreaterThanOrEqual(150);
      expect(totalTime).toBeLessThan(250); // Allow some overhead
    });

    it('should compute correct layers for diamond dependencies', async () => {
      //     A
      //    / \
      //   B   C
      //    \ /
      //     D
      // Layers: [A], [B, C], [D]
      const serviceA = new TimestampService('A', [], true, 50);
      const serviceB = new TimestampService('B', ['A'], true, 50);
      const serviceC = new TimestampService('C', ['A'], true, 50);
      const serviceD = new TimestampService('D', ['B', 'C'], true, 50);

      app.register(serviceA);
      app.register(serviceB);
      app.register(serviceC);
      app.register(serviceD);

      const startTime = Date.now();
      await app.start();
      const totalTime = Date.now() - startTime;

      // Verify A starts first
      expect(serviceA.startTime).toBeLessThan(serviceB.startTime!);
      expect(serviceA.startTime).toBeLessThan(serviceC.startTime!);

      // Verify B and C start concurrently (within 20ms)
      const bcDiff = Math.abs(serviceB.startTime! - serviceC.startTime!);
      expect(bcDiff).toBeLessThan(20);

      // Verify D starts after B and C
      expect(serviceD.startTime).toBeGreaterThan(serviceB.startTime!);
      expect(serviceD.startTime).toBeGreaterThan(serviceC.startTime!);

      // Total time should be ~150ms (3 layers * 50ms)
      // NOT ~200ms (4 services * 50ms sequential)
      expect(totalTime).toBeGreaterThanOrEqual(150);
      expect(totalTime).toBeLessThan(250);
    });

    it('should compute correct layers for multiple independent trees', async () => {
      // Tree 1: A → B
      // Tree 2: C → D
      // Layers: [A, C], [B, D]
      const serviceA = new TimestampService('A', [], true, 50);
      const serviceB = new TimestampService('B', ['A'], true, 50);
      const serviceC = new TimestampService('C', [], true, 50);
      const serviceD = new TimestampService('D', ['C'], true, 50);

      app.register(serviceA);
      app.register(serviceB);
      app.register(serviceC);
      app.register(serviceD);

      const startTime = Date.now();
      await app.start();
      const totalTime = Date.now() - startTime;

      // Verify A and C start concurrently (layer 0)
      const acDiff = Math.abs(serviceA.startTime! - serviceC.startTime!);
      expect(acDiff).toBeLessThan(20);

      // Verify B and D start concurrently (layer 1)
      const bdDiff = Math.abs(serviceB.startTime! - serviceD.startTime!);
      expect(bdDiff).toBeLessThan(20);

      // Total time should be ~100ms (2 layers * 50ms)
      // NOT ~200ms (4 services * 50ms sequential)
      expect(totalTime).toBeGreaterThanOrEqual(100);
      expect(totalTime).toBeLessThan(180);
    });
  });

  describe('Performance Comparison', () => {
    it('should be faster than sequential startup for parallel services', async () => {
      // Create 4 independent services (all in layer 0)
      const services = [
        new TimestampService('S1', [], true, 100),
        new TimestampService('S2', [], true, 100),
        new TimestampService('S3', [], true, 100),
        new TimestampService('S4', [], true, 100),
      ];

      services.forEach((s) => app.register(s));

      const startTime = Date.now();
      await app.start();
      const actualTime = Date.now() - startTime;

      // Sequential would take 400ms (4 * 100ms)
      const sequentialTime = 400;

      // Parallel should take ~100ms (all concurrent)
      expect(actualTime).toBeLessThan(200); // Allow overhead
      expect(actualTime).toBeLessThan(sequentialTime * 0.5); // At least 50% faster

      // Verify all started concurrently (within 20ms)
      const startTimes = services.map((s) => s.startTime!);
      const maxDiff = Math.max(...startTimes) - Math.min(...startTimes);
      expect(maxDiff).toBeLessThan(20);
    });

    it('should log performance metrics', async () => {
      // Create realistic dependency graph (similar to real app)
      const env = new TimestampService('env', [], true, 10);
      const config = new TimestampService('config', ['env'], true, 10);
      const gateway = new TimestampService('gateway', ['env', 'config'], true, 500);
      const vite = new TimestampService('vite-dev', ['gateway'], true, 100);
      const window = new TimestampService('window', ['gateway', 'vite-dev'], true, 200);

      app.register(env);
      app.register(config);
      app.register(gateway);
      app.register(vite);
      app.register(window);

      const startTime = Date.now();
      await app.start();
      const actualTime = Date.now() - startTime;

      // Sequential: 10 + 10 + 500 + 100 + 200 = 820ms
      const sequentialTime = 820;

      // Parallel: max(10) + max(10) + max(500) + max(100) + max(200) = 820ms
      // But with optimization: some services can overlap
      // Expected: ~820ms (no parallelization opportunity in this linear case)

      console.log(`[Test] Actual time: ${actualTime}ms`);
      console.log(`[Test] Sequential time: ${sequentialTime}ms`);
      console.log(
        `[Test] Improvement: ${((1 - actualTime / sequentialTime) * 100).toFixed(1)}%`
      );

      // This graph is mostly linear, so not much speedup expected
      expect(actualTime).toBeGreaterThanOrEqual(sequentialTime * 0.9);
      expect(actualTime).toBeLessThan(sequentialTime * 1.2);
    });
  });

  describe('Dependency Ordering', () => {
    it('should start dependencies before dependents', async () => {
      const serviceA = new TimestampService('A', [], true, 50);
      const serviceB = new TimestampService('B', ['A'], true, 50);
      const serviceC = new TimestampService('C', ['B'], true, 50);

      app.register(serviceA);
      app.register(serviceB);
      app.register(serviceC);

      await app.start();

      // A must finish before B starts
      expect(serviceA.startTime! + 50).toBeLessThanOrEqual(serviceB.startTime!);

      // B must finish before C starts
      expect(serviceB.startTime! + 50).toBeLessThanOrEqual(serviceC.startTime!);
    });

    it('should handle multiple dependencies correctly', async () => {
      const serviceA = new TimestampService('A', [], true, 50);
      const serviceB = new TimestampService('B', [], true, 50);
      const serviceC = new TimestampService('C', ['A', 'B'], true, 50);

      app.register(serviceA);
      app.register(serviceB);
      app.register(serviceC);

      await app.start();

      // Both A and B must finish before C starts
      const aFinish = serviceA.startTime! + 50;
      const bFinish = serviceB.startTime! + 50;
      const cStart = serviceC.startTime!;

      expect(aFinish).toBeLessThanOrEqual(cStart);
      expect(bFinish).toBeLessThanOrEqual(cStart);
    });
  });

  describe('Error Handling', () => {
    it('should continue with optional service failures in same layer', async () => {
      class FailingService extends TimestampService {
        async start(): Promise<void> {
          this.startTime = Date.now();
          await new Promise((resolve) => setTimeout(resolve, this.startDuration));
          throw new Error('Service failed to start');
        }
      }

      const serviceA = new TimestampService('A', [], true, 50);
      const serviceB = new FailingService('B', ['A'], false, 50); // Optional
      const serviceC = new TimestampService('C', ['A'], true, 50);

      app.register(serviceA);
      app.register(serviceB);
      app.register(serviceC);

      // Should not throw (B is optional)
      await expect(app.start()).resolves.not.toThrow();

      // A and C should succeed
      expect(serviceA.isHealthy()).toBe(true);
      expect(serviceC.isHealthy()).toBe(true);

      // B and C should start concurrently despite B's failure
      const bcDiff = Math.abs(serviceB.startTime! - serviceC.startTime!);
      expect(bcDiff).toBeLessThan(20);
    });
  });
});
