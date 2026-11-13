/** Reverse-WebSocket lifecycle boundary for NapCat OneBot v11 events. */
import type { QqEnvelope } from '../envelope.ts'
import { oneBotEnvelope } from './protocol.ts'

export interface OneBotSocket {
  onMessage(handler: (value: string | Uint8Array) => void): void
  onClose(handler: () => void): void
  close(code?: number, reason?: string): void
}

export interface OneBotServer {
  onConnection(handler: (socket: OneBotSocket, headers: Readonly<Record<string, string | undefined>>) => void): void
  close(): Promise<void>
}

export interface OneBotGatewayHealth { state: 'starting' | 'ready' | 'error'; detail: string }
interface Options {
  server: OneBotServer
  token: string
  identity: { instanceId: string; selfId: string }
  maxBytes?: number
  receive(envelope: QqEnvelope): void | Promise<void>
  report(health: OneBotGatewayHealth): void
}

const bytes = (value: string | Uint8Array): number => typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength
const decode = (value: string | Uint8Array): string => typeof value === 'string' ? value : new TextDecoder().decode(value)

/** Accepts one authenticated NapCat connection and turns validated events into shared envelopes. */
export class OneBotGateway {
  private active?: OneBotSocket
  private started = false
  constructor(private readonly options: Options) {}

  start(): void {
    if (this.started) return
    this.started = true
    this.options.report({ state: 'starting', detail: 'Waiting for NapCat reverse WebSocket' })
    this.options.server.onConnection((socket, headers) => this.connected(socket, headers))
  }

  async stop(): Promise<void> {
    this.active?.close(1001, 'shutdown')
    this.active = undefined
    await this.options.server.close()
  }

  private connected(socket: OneBotSocket, headers: Readonly<Record<string, string | undefined>>): void {
    const expected = `Bearer ${this.options.token}`
    if (!this.options.token || headers.authorization !== expected) { socket.close(4401, 'unauthorized'); return }
    this.active?.close(4409, 'replaced')
    this.active = socket
    socket.onClose(() => { if (this.active === socket) { this.active = undefined; this.options.report({ state: 'starting', detail: 'NapCat disconnected' }) } })
    socket.onMessage(value => this.message(socket, value))
    this.options.report({ state: 'ready', detail: 'NapCat reverse WebSocket connected' })
  }

  private message(socket: OneBotSocket, value: string | Uint8Array): void {
    if (bytes(value) > (this.options.maxBytes ?? 1024 * 1024)) {
      socket.close(4400, 'message too large')
      this.options.report({ state: 'error', detail: 'NapCat message exceeded size limit' })
      return
    }
    let event: unknown
    try { event = JSON.parse(decode(value)) }
    catch { this.options.report({ state: 'error', detail: 'NapCat sent malformed JSON' }); return }
    if (event && typeof event === 'object' && 'post_type' in event && event.post_type === 'meta_event'
      && 'meta_event_type' in event && event.meta_event_type === 'heartbeat') {
      this.options.report({ state: 'ready', detail: 'NapCat heartbeat received' })
      return
    }
    const envelope = oneBotEnvelope(event, this.options.identity)
    if (envelope) void Promise.resolve(this.options.receive(envelope)).catch(() => {
      this.options.report({ state: 'error', detail: 'NapCat message delivery failed' })
    })
  }
}
