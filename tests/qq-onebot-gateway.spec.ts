import { describe, expect, it, vi } from 'vitest'
import { OneBotGateway, type OneBotServer, type OneBotSocket } from '../src/sources/qq/onebot/gateway.ts'
import { createOneBotRuntime } from '../src/sources/qq/onebot/plugin.ts'

class FakeSocket implements OneBotSocket {
  private message?: (value: string | Uint8Array) => void
  private closed?: () => void
  closeCode?: number
  onMessage(handler: (value: string | Uint8Array) => void): void { this.message = handler }
  onClose(handler: () => void): void { this.closed = handler }
  emit(value: string | Uint8Array): void { this.message?.(value) }
  close(code?: number): void { this.closeCode = code; this.closed?.() }
}

class FakeServer implements OneBotServer {
  private connection?: (socket: OneBotSocket, headers: Readonly<Record<string, string | undefined>>) => void
  closed = false
  onConnection(handler: (socket: OneBotSocket, headers: Readonly<Record<string, string | undefined>>) => void): void { this.connection = handler }
  connect(socket: OneBotSocket, authorization?: string): void { this.connection?.(socket, { authorization }) }
  async close(): Promise<void> { this.closed = true }
}

const options = (server: FakeServer) => ({ server, token: 'token-1', identity: { instanceId: '10000', selfId: '10000' },
  receive: vi.fn(), report: vi.fn(), maxBytes: 1024 })

describe('OneBot reverse WebSocket gateway', () => {
  it('rejects unauthenticated connections and keeps one active socket', async () => {
    const server = new FakeServer(), gateway = new OneBotGateway(options(server)); gateway.start()
    const denied = new FakeSocket(); server.connect(denied); expect(denied.closeCode).toBe(4401)
    const first = new FakeSocket(), second = new FakeSocket(); server.connect(first, 'Bearer token-1'); server.connect(second, 'Bearer token-1')
    expect(first.closeCode).toBe(4409); expect(second.closeCode).toBeUndefined()
    await gateway.stop()
  })

  it('delivers messages, reports heartbeat health and ignores malformed JSON', async () => {
    const server = new FakeServer(), config = options(server), gateway = new OneBotGateway(config); gateway.start()
    const socket = new FakeSocket(); server.connect(socket, 'Bearer token-1')
    socket.emit('{bad json')
    socket.emit(JSON.stringify({ post_type: 'meta_event', meta_event_type: 'heartbeat', self_id: 10000, time: 1794297600 }))
    socket.emit(JSON.stringify({ post_type: 'message', message_type: 'private', self_id: 10000, user_id: 20000,
      message_id: 1, time: 1794297600, message: 'hello' }))
    expect(config.receive).toHaveBeenCalledWith(expect.objectContaining({ messageId: '1', text: 'hello' }))
    expect(config.report).toHaveBeenCalledWith(expect.objectContaining({ state: 'ready' }))
    await gateway.stop(); expect(server.closed).toBe(true)
  })

  it('closes oversized messages without exposing the token', async () => {
    const server = new FakeServer(), config = { ...options(server), maxBytes: 8 }, gateway = new OneBotGateway(config); gateway.start()
    const socket = new FakeSocket(); server.connect(socket, 'Bearer token-1'); socket.emit('123456789')
    expect(socket.closeCode).toBe(4400)
    expect(JSON.stringify(config.report.mock.calls)).not.toContain('token-1')
    await gateway.stop()
  })

  it('builds one personal-account runtime around a supplied server', () => {
    const server = new FakeServer()
    const runtime = createOneBotRuntime({ server, token: 'token-1', instanceId: '10000', selfId: '10000',
      endpoint: 'http://127.0.0.1:3000', receive: vi.fn(), report: vi.fn() })
    expect(runtime.gateway).toBeInstanceOf(OneBotGateway)
    expect(runtime.client).toBeDefined()
  })
})
