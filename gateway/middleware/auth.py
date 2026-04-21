"""
Gateway 身份验证中间件

要求除 /health 外的所有 API 端点带有 Authorization: Bearer <token> 头。
Token 通过 GATEWAY_AUTH_TOKEN 环境变量传递。
"""

import os
from typing import Callable, Awaitable
from aiohttp import web


@web.middleware
async def auth_middleware(
    request: web.Request,
    handler: Callable[[web.Request], Awaitable[web.Response]]
) -> web.Response:
    """
    身份验证中间件

    - /health 端点无需认证
    - 开发模式（无 GATEWAY_AUTH_TOKEN）跳过认证
    - 其他所有端点要求 Authorization: Bearer <token>
    """

    # 健康检查端点无需认证
    if request.path == '/health':
        return await handler(request)

    # Electron 模式：完全跳过身份验证
    electron_mode = os.environ.get('GATEWAY_ELECTRON_MODE')
    print(f"[auth_middleware] path={request.path}, GATEWAY_ELECTRON_MODE={electron_mode}", flush=True)
    if electron_mode == 'true':
        print("[auth_middleware] Skipping auth for Electron mode", flush=True)
        return await handler(request)

    # 获取期望的 token（生产模式必须设置）
    expected_token = os.environ.get('GATEWAY_AUTH_TOKEN')

    # 开发模式：如果未设置 token，跳过认证
    if not expected_token:
        return await handler(request)

    # 生产模式：验证 Authorization 头
    auth_header = request.headers.get('Authorization', '')

    # 检查是否提供了认证头
    if not auth_header:
        raise web.HTTPUnauthorized(
            text='Missing Authorization header',
            headers={'WWW-Authenticate': 'Bearer'}
        )

    # 检查格式是否正确
    if not auth_header.startswith('Bearer '):
        raise web.HTTPUnauthorized(
            text='Invalid Authorization header format (expected "Bearer <token>")',
            headers={'WWW-Authenticate': 'Bearer'}
        )

    # 提取 token
    token = auth_header[7:]  # 去掉 "Bearer " 前缀

    # 验证 token
    if token != expected_token:
        raise web.HTTPForbidden(
            text='Invalid authentication token'
        )

    # 认证通过，继续处理请求
    return await handler(request)
