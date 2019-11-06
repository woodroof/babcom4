#!/usr/bin/env python3
import asyncio

from aiohttp import web
from aiojobs.aiohttp import setup

PORT = 8000

async def init_socket(socket, request):
    await socket.prepare(request)

async def api(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    async for msg in ws:
        pass

    return ws

async def init_app():
    app = web.Application()
    setup(app)
    app.add_routes(
        [
            web.get('/api/', api)
        ])

    return app

if __name__ == '__main__':
    loop = asyncio.get_event_loop()
    app = loop.run_until_complete(init_app())
    web.run_app(app, port = PORT)
