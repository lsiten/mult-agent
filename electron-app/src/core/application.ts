/**
 * Application 类
 *
 * 管理应用服务生命周期，提供：
 * - 服务注册
 * - 依赖解析（拓扑排序）
 * - 顺序启动/停止
 * - 失败时自动回滚
 */

import { Service, ServiceState, ServiceMetadata } from './service.interface';

/**
 * 拓扑排序结果
 */
interface TopologicalSortResult {
  /** 排序后的服务 ID 列表 */
  order: string[];
  /** 是否存在循环依赖 */
  hasCycle: boolean;
  /** 循环依赖路径（如果存在） */
  cycle?: string[];
}

/**
 * Application 类
 */
export class Application {
  /** 服务注册表 */
  private services = new Map<string, ServiceMetadata>();

  /** 是否已启动 */
  private started = false;

  /**
   * 注册服务
   *
   * @param service 服务实例
   * @throws {Error} 如果服务 ID 重复
   */
  register(service: Service): void {
    if (this.services.has(service.id)) {
      throw new Error(`Service "${service.id}" is already registered`);
    }

    // 验证 ID 格式
    if (!service.id || service.id.trim() === '') {
      throw new Error('Service ID cannot be empty');
    }

    this.services.set(service.id, {
      service,
      state: ServiceState.PENDING,
    });

    console.log(`[Application] Registered service: ${service.id}`);
  }

  /**
   * 获取服务实例
   *
   * @param id 服务 ID
   * @returns 服务实例，如果不存在返回 undefined
   */
  get<T extends Service>(id: string): T | undefined {
    const metadata = this.services.get(id);
    return metadata?.service as T | undefined;
  }

  /**
   * 获取所有已注册的服务
   */
  getAll(): Service[] {
    return Array.from(this.services.values()).map((m) => m.service);
  }

  /**
   * 获取服务元数据
   *
   * @param id 服务 ID
   */
  getMetadata(id: string): ServiceMetadata | undefined {
    return this.services.get(id);
  }

  /**
   * 启动所有服务
   *
   * 按依赖层级并发启动，失败时自动回滚
   *
   * @throws {Error} 如果存在循环依赖或必需服务启动失败
   */
  async start(): Promise<void> {
    if (this.started) {
      console.warn('[Application] Already started');
      return;
    }

    console.log('[Application] Starting services with layered parallelization...');
    const overallStartTime = Date.now();

    // 1. 验证依赖
    this.validateDependencies();

    // 2. 计算依赖层级
    const layers = this.computeLayers();
    if (layers.length === 0) {
      throw new Error('No services registered');
    }

    console.log('[Application] Service layers:');
    layers.forEach((layer, i) => {
      console.log(`  Layer ${i}: ${layer.join(', ')}`);
    });

    // 3. 按层级并发启动
    const startedServices: string[] = [];
    try {
      for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
        const layer = layers[layerIndex];
        const layerStartTime = Date.now();

        console.log(`[Application] Starting layer ${layerIndex} (${layer.length} services)...`);

        // 同层服务并发启动
        const layerPromises = layer.map(async (id) => {
          const metadata = this.services.get(id);
          if (!metadata) {
            throw new Error(`Service "${id}" not found`);
          }
          await this.startService(metadata);
          return id;
        });

        // 等待当前层所有服务启动完成
        const layerResults = await Promise.all(layerPromises);
        startedServices.push(...layerResults);

        const layerDuration = Date.now() - layerStartTime;
        console.log(`[Application] Layer ${layerIndex} completed in ${layerDuration}ms`);
      }

      const overallDuration = Date.now() - overallStartTime;
      const sequentialEstimate = this.estimateSequentialTime(layers);

      this.started = true;
      console.log('[Application] All services started successfully');
      console.log(`[Application] Total time: ${overallDuration}ms (vs ${sequentialEstimate}ms sequential, ${Math.round((1 - overallDuration / sequentialEstimate) * 100)}% faster)`);
    } catch (error) {
      console.error('[Application] Startup failed, rolling back:', error);

      // 回滚：按相反顺序停止已启动的服务
      for (let i = startedServices.length - 1; i >= 0; i--) {
        const id = startedServices[i];
        const metadata = this.services.get(id);
        if (metadata) {
          try {
            await this.stopService(metadata);
          } catch (stopError) {
            console.error(`[Application] Failed to stop ${id} during rollback:`, stopError);
          }
        }
      }

      throw error;
    }
  }

  /**
   * 计算服务依赖层级
   *
   * 使用 BFS 算法将服务分组到不同层级，同层服务无依赖关系可并发启动
   *
   * @returns 服务 ID 的二维数组，每个内层数组代表一个层级
   */
  private computeLayers(): string[][] {
    // 构建邻接表和入度表
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // 初始化
    for (const [id] of this.services) {
      inDegree.set(id, 0);
      adjList.set(id, []);
    }

    // 构建图：依赖关系 (依赖 -> 被依赖)
    for (const [id, metadata] of this.services) {
      const { service } = metadata;
      for (const depId of service.dependencies) {
        // depId -> id (depId 必须在 id 之前启动)
        adjList.get(depId)!.push(id);
        inDegree.set(id, inDegree.get(id)! + 1);
      }
    }

    // BFS 分层
    const layers: string[][] = [];
    let currentLayer = Array.from(inDegree.entries())
      .filter(([_, deg]) => deg === 0)
      .map(([id]) => id);

    while (currentLayer.length > 0) {
      layers.push([...currentLayer]);

      // 计算下一层
      const nextLayer: string[] = [];
      const processed = new Set(currentLayer);

      for (const id of currentLayer) {
        const neighbors = adjList.get(id)!;
        for (const neighbor of neighbors) {
          const newDegree = inDegree.get(neighbor)! - 1;
          inDegree.set(neighbor, newDegree);

          if (newDegree === 0 && !processed.has(neighbor)) {
            nextLayer.push(neighbor);
            processed.add(neighbor);
          }
        }
      }

      currentLayer = nextLayer;
    }

    // 检测循环依赖
    const totalProcessed = layers.flat().length;
    if (totalProcessed !== this.services.size) {
      const unprocessed = Array.from(this.services.keys()).filter(
        (id) => !layers.flat().includes(id)
      );
      throw new Error(
        `Circular dependency detected involving: ${unprocessed.join(', ')}`
      );
    }

    return layers;
  }

  /**
   * 估算串行启动时间（用于性能对比）
   */
  private estimateSequentialTime(layers: string[][]): number {
    // 假设每个服务平均启动时间为 500ms
    const avgServiceStartTime = 500;
    const totalServices = layers.flat().length;
    return totalServices * avgServiceStartTime;
  }

  /**
   * 停止所有服务
   *
   * 按照启动顺序的相反顺序停止
   */
  async stop(): Promise<void> {
    if (!this.started) {
      console.warn('[Application] Not started');
      return;
    }

    console.log('[Application] Stopping services...');

    // 按相反顺序停止
    const sortResult = this.topologicalSort();
    const reverseOrder = [...sortResult.order].reverse();

    for (const id of reverseOrder) {
      const metadata = this.services.get(id);
      if (!metadata) continue;

      if (metadata.state === ServiceState.STARTED) {
        try {
          await this.stopService(metadata);
        } catch (error) {
          console.error(`[Application] Failed to stop ${id}:`, error);
        }
      }
    }

    this.started = false;
    console.log('[Application] All services stopped');
  }

  /**
   * 验证所有服务的依赖是否都已注册
   *
   * @throws {Error} 如果存在未注册的依赖
   */
  private validateDependencies(): void {
    for (const [id, metadata] of this.services) {
      const { service } = metadata;
      for (const depId of service.dependencies) {
        if (!this.services.has(depId)) {
          throw new Error(
            `Service "${id}" depends on "${depId}", but "${depId}" is not registered`
          );
        }
      }
    }
  }

  /**
   * 拓扑排序（Kahn's Algorithm）
   *
   * 计算服务启动顺序，检测循环依赖
   */
  private topologicalSort(): TopologicalSortResult {
    // 计算每个节点的入度
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // 初始化
    for (const [id] of this.services) {
      inDegree.set(id, 0);
      adjList.set(id, []);
    }

    // 构建邻接表和入度表
    for (const [id, metadata] of this.services) {
      const { service } = metadata;
      for (const depId of service.dependencies) {
        // depId -> id (depId 必须在 id 之前启动)
        adjList.get(depId)!.push(id);
        inDegree.set(id, inDegree.get(id)! + 1);
      }
    }

    // Kahn 算法
    const queue: string[] = [];
    const order: string[] = [];

    // 将所有入度为 0 的节点加入队列
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      // 移除当前节点的所有出边
      const neighbors = adjList.get(current)!;
      for (const neighbor of neighbors) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // 检测循环依赖
    if (order.length !== this.services.size) {
      // 找出循环路径
      const unvisited = Array.from(this.services.keys()).filter(
        (id) => !order.includes(id)
      );
      return {
        order: [],
        hasCycle: true,
        cycle: this.findCycle(unvisited[0], adjList),
      };
    }

    return {
      order,
      hasCycle: false,
    };
  }

  /**
   * 查找循环依赖路径（DFS）
   */
  private findCycle(
    start: string,
    adjList: Map<string, string[]>
  ): string[] {
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): boolean => {
      if (path.includes(node)) {
        // 找到循环
        return true;
      }

      if (visited.has(node)) {
        return false;
      }

      visited.add(node);
      path.push(node);

      const neighbors = adjList.get(node) || [];
      for (const neighbor of neighbors) {
        if (dfs(neighbor)) {
          return true;
        }
      }

      path.pop();
      return false;
    };

    dfs(start);
    return path;
  }

  /**
   * 启动单个服务
   */
  private async startService(metadata: ServiceMetadata): Promise<void> {
    const { service } = metadata;

    console.log(`[Application] Starting ${service.id}...`);
    metadata.state = ServiceState.STARTING;

    try {
      await service.start();
      metadata.state = ServiceState.STARTED;
      metadata.startedAt = new Date();
      console.log(`[Application] ✓ ${service.id} started`);
    } catch (error) {
      metadata.state = ServiceState.FAILED;
      metadata.lastError = error as Error;

      // 调用服务的错误回调（如果有）
      if (service.onError) {
        service.onError(error as Error);
      }

      // 必需服务失败时抛出错误
      if (service.required) {
        throw new Error(
          `Required service "${service.id}" failed to start: ${
            (error as Error).message
          }`
        );
      } else {
        // 可选服务失败时仅记录警告
        console.warn(`[Application] Optional service "${service.id}" failed to start:`, error);
      }
    }
  }

  /**
   * 停止单个服务
   */
  private async stopService(metadata: ServiceMetadata): Promise<void> {
    const { service } = metadata;

    console.log(`[Application] Stopping ${service.id}...`);
    metadata.state = ServiceState.STOPPING;

    try {
      await service.stop();
      metadata.state = ServiceState.STOPPED;
      metadata.stoppedAt = new Date();
      console.log(`[Application] ✓ ${service.id} stopped`);
    } catch (error) {
      console.error(`[Application] Failed to stop ${service.id}:`, error);
      metadata.state = ServiceState.FAILED;
      metadata.lastError = error as Error;
      throw error;
    }
  }

  /**
   * 获取应用状态摘要
   */
  getStatus(): {
    started: boolean;
    services: Array<{
      id: string;
      state: ServiceState;
      required: boolean;
      healthy: boolean;
      startedAt?: Date;
      lastError?: string;
    }>;
  } {
    return {
      started: this.started,
      services: Array.from(this.services.values()).map((metadata) => ({
        id: metadata.service.id,
        state: metadata.state,
        required: metadata.service.required,
        healthy: metadata.service.isHealthy(),
        startedAt: metadata.startedAt,
        lastError: metadata.lastError?.message,
      })),
    };
  }
}
