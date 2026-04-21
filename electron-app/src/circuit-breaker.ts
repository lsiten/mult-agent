export enum CircuitState {
  CLOSED = 'CLOSED',         // 正常工作
  OPEN = 'OPEN',             // 断路，拒绝请求
  HALF_OPEN = 'HALF_OPEN'    // 尝试恢复
}

export interface CircuitBreakerConfig {
  failureThreshold: number;       // 失败次数阈值
  successThreshold: number;       // 恢复需要的成功次数
  timeout: number;                // 断路器打开后的超时时间 (ms)
  onStateChange?: (state: CircuitState) => void;
  onOpen?: () => void;            // 断路器打开回调
  onHalfOpen?: () => void;        // 进入半开状态回调
  onClose?: () => void;           // 断路器关闭回调
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailTime = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 分钟
      ...config
    };
  }

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 检查是否可以执行
    if (this.state === CircuitState.OPEN) {
      // 检查是否超时，可以尝试恢复
      if (Date.now() - this.lastFailTime > this.config.timeout) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new Error(
          `Circuit breaker is OPEN. ` +
          `Will retry in ${Math.ceil((this.config.timeout - (Date.now() - this.lastFailTime)) / 1000)}s`
        );
      }
    }

    try {
      const result = await fn();

      // 成功执行
      this.onSuccess();
      return result;

    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * 手动记录成功
   */
  public recordSuccess(): void {
    this.onSuccess();
  }

  /**
   * 手动记录失败
   */
  public recordFailure(): void {
    this.onFailure();
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;

      // 达到成功阈值，关闭断路器
      if (this.successes >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
        this.successes = 0;
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailTime = Date.now();
    this.successes = 0;

    // 达到失败阈值，打开断路器
    if (this.failures >= this.config.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) {
      return;
    }

    console.log(`[CircuitBreaker] State transition: ${this.state} → ${newState}`);
    this.state = newState;

    // 触发回调
    if (this.config.onStateChange) {
      this.config.onStateChange(newState);
    }

    switch (newState) {
      case CircuitState.OPEN:
        if (this.config.onOpen) {
          this.config.onOpen();
        }
        break;
      case CircuitState.HALF_OPEN:
        if (this.config.onHalfOpen) {
          this.config.onHalfOpen();
        }
        break;
      case CircuitState.CLOSED:
        if (this.config.onClose) {
          this.config.onClose();
        }
        break;
    }
  }

  public getState(): CircuitState {
    return this.state;
  }

  public getStats() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailTime: this.lastFailTime
    };
  }

  public reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailTime = 0;
  }
}
