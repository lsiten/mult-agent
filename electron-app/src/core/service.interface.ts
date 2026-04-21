/**
 * Service 接口
 *
 * 所有应用服务的标准化契约，提供统一的生命周期管理
 */

/**
 * 服务状态
 */
export enum ServiceState {
  /** 已注册但未启动 */
  PENDING = 'pending',
  /** 正在启动 */
  STARTING = 'starting',
  /** 已成功启动 */
  STARTED = 'started',
  /** 正在停止 */
  STOPPING = 'stopping',
  /** 已停止 */
  STOPPED = 'stopped',
  /** 启动失败 */
  FAILED = 'failed',
}

/**
 * 服务接口
 *
 * 所有应用服务必须实现此接口
 */
export interface Service {
  /**
   * 服务唯一标识符
   *
   * 用于依赖解析和服务检索
   */
  readonly id: string;

  /**
   * 服务是否为必需
   *
   * - true: 启动失败时中止整个应用
   * - false: 启动失败时记录警告并继续
   */
  readonly required: boolean;

  /**
   * 服务依赖的其他服务 ID 列表
   *
   * 用于拓扑排序计算启动顺序
   */
  readonly dependencies: string[];

  /**
   * 启动服务
   *
   * @throws {Error} 启动失败时抛出错误
   */
  start(): Promise<void>;

  /**
   * 停止服务
   *
   * 应该是幂等的 - 多次调用不应产生副作用
   */
  stop(): Promise<void>;

  /**
   * 检查服务是否健康
   *
   * 此方法应该快速返回（<100ms），不应执行网络调用或重计算
   *
   * @returns true 表示服务健康，false 表示服务不健康
   */
  isHealthy(): boolean;

  /**
   * 错误回调（可选）
   *
   * 在服务启动失败时调用，用于自定义错误处理
   *
   * @param error 错误对象
   */
  onError?(error: Error): void;

  /**
   * 获取服务指标（可选）
   *
   * 用于监控和调试
   *
   * @returns 指标键值对
   */
  getMetrics?(): Record<string, any>;
}

/**
 * 服务元数据
 *
 * 由 Application 类管理，追踪服务运行时状态
 */
export interface ServiceMetadata {
  /** 服务实例 */
  service: Service;
  /** 当前状态 */
  state: ServiceState;
  /** 启动时间戳 */
  startedAt?: Date;
  /** 停止时间戳 */
  stoppedAt?: Date;
  /** 最近的错误 */
  lastError?: Error;
}
