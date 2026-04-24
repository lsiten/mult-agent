"""
Gateway stdin/stdout 管道通信模式

替代 HTTP 服务器，通过 JSON-RPC over stdio 与 Electron 通信。
每行一个 JSON 请求/响应，保持协议简单可靠。

协议格式:
{
  "id": "unique-request-id",
  "method": "GET /api/sessions",
  "headers": {"X-Hermes-Token": "..."},
  "body": {...}  // 可选，POST/PUT 请求时存在
}

响应格式:
{
  "id": "unique-request-id",
  "status": 200,
  "headers": {"Content-Type": "application/json"},
  "body": {...}
}
"""

import asyncio
import json
import logging
import sys
from typing import Any, Dict, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class PipeRequest:
    """管道请求"""
    id: str
    method: str  # "GET /api/sessions", "POST /v1/chat/completions"
    headers: Dict[str, str]
    body: Optional[Dict[str, Any]] = None


@dataclass
class PipeResponse:
    """管道响应"""
    id: str
    status: int
    headers: Dict[str, str]
    body: Any


class PipeServer:
    """
    stdin/stdout 管道服务器

    职责:
    1. 从 stdin 读取 JSON-RPC 请求（非阻塞）
    2. 路由到对应的 API handler（复用现有 api_server 逻辑）
    3. 将响应写入 stdout（带换行符）

    协议规则:
    - 每行一个完整 JSON 对象（请求/响应）
    - 使用换行符 '\n' 分隔消息
    - 支持请求 ID 匹配（客户端可并发请求）
    """

    def __init__(self):
        self.running = False
        self.handlers: Dict[str, Any] = {}  # 路由表：method_path -> handler
        self._register_handlers()

    def _register_handlers(self):
        """注册路由处理器（从 api_server.py 迁移逻辑）"""
        # TODO: 将现有 aiohttp 路由逻辑迁移到这里
        # 示例：
        # self.handlers["GET /health"] = self.handle_health
        # self.handlers["GET /api/sessions"] = self.handle_get_sessions
        # self.handlers["POST /v1/chat/completions"] = self.handle_chat_completions
        pass

    async def start(self):
        """启动管道服务器"""
        self.running = True
        logger.info("[PipeServer] Starting stdin/stdout pipe mode")

        # 使用 asyncio 非阻塞读取 stdin
        loop = asyncio.get_event_loop()
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)

        # 将 stdin 绑定到 StreamReader
        await loop.connect_read_pipe(lambda: protocol, sys.stdin)

        try:
            while self.running:
                # 读取一行（直到 '\n'）
                line = await reader.readline()
                if not line:
                    # EOF，客户端关闭了管道
                    logger.info("[PipeServer] stdin closed, shutting down")
                    break

                # 解析请求并处理
                try:
                    request_data = json.loads(line.decode('utf-8').strip())
                    await self._handle_request(request_data)
                except json.JSONDecodeError as e:
                    logger.error(f"[PipeServer] Invalid JSON: {e}")
                    # 无法响应（不知道 request_id）
                except Exception as e:
                    logger.error(f"[PipeServer] Request handling error: {e}", exc_info=True)

        except asyncio.CancelledError:
            logger.info("[PipeServer] Server cancelled")
        finally:
            self.running = False

    async def _handle_request(self, data: Dict[str, Any]):
        """处理单个请求"""
        try:
            request = PipeRequest(
                id=data['id'],
                method=data['method'],
                headers=data.get('headers', {}),
                body=data.get('body')
            )

            # 路由到对应的 handler
            handler = self.handlers.get(request.method)
            if not handler:
                response = PipeResponse(
                    id=request.id,
                    status=404,
                    headers={"Content-Type": "application/json"},
                    body={"error": f"Route not found: {request.method}"}
                )
            else:
                # 调用 handler（异步）
                result = await handler(request)
                response = PipeResponse(
                    id=request.id,
                    status=200,
                    headers={"Content-Type": "application/json"},
                    body=result
                )

        except Exception as e:
            logger.error(f"[PipeServer] Handler error: {e}", exc_info=True)
            response = PipeResponse(
                id=data.get('id', 'unknown'),
                status=500,
                headers={"Content-Type": "application/json"},
                body={"error": str(e)}
            )

        # 写入响应到 stdout（单行 JSON + '\n'）
        self._write_response(response)

    def _write_response(self, response: PipeResponse):
        """将响应写入 stdout"""
        response_json = json.dumps({
            "id": response.id,
            "status": response.status,
            "headers": response.headers,
            "body": response.body
        })

        # 确保单行输出（不能有内部换行符）
        response_json = response_json.replace('\n', ' ')

        # 写入 stdout + flush
        sys.stdout.write(response_json + '\n')
        sys.stdout.flush()

    async def stop(self):
        """停止服务器"""
        self.running = False
        logger.info("[PipeServer] Stopped")

    # ========== Handler 示例（TODO: 完整迁移 api_server.py 逻辑）==========

    async def handle_health(self, request: PipeRequest) -> Dict[str, Any]:
        """健康检查"""
        return {"status": "ok"}

    async def handle_get_sessions(self, request: PipeRequest) -> Dict[str, Any]:
        """获取会话列表（示例）"""
        # TODO: 调用 hermes_state.SessionDB
        return {"sessions": []}


async def run_pipe_server():
    """管道服务器主入口"""
    server = PipeServer()
    try:
        await server.start()
    except KeyboardInterrupt:
        await server.stop()


if __name__ == "__main__":
    # 测试入口
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_pipe_server())
