/** Lifecycle adapter between the official QQ SDK and the shared QQ envelope. */
import type { QqEnvelope } from '../envelope.ts'
import { officialEnvelope } from './protocol.ts'

export interface OfficialBotEventMap {
  message: unknown
  ready: undefined
  resumed: undefined
  disconnected: { code: number; reason: string; willReconnect: boolean }
  error: unknown
}

/** The narrow surface implemented by Tencent's QQBot SDK facade. */
export interface OfficialBotClient {
  on<K extends keyof OfficialBotEventMap>(event: K, handler: (value: OfficialBotEventMap[K]) => void): this
  start(signal: AbortSignal): Promise<void>
  stop(): void
}

export interface OfficialGatewayHealth { state: 'starting' | 'ready' | 'error'; detail: string; at?: string }

interface Options {
  appId: string
  appSecret: string
  instanceId: string
  selfId: string
  client: OfficialBotClient
  receive(envelope: QqEnvelope): void | Promise<void>
  report(health: OfficialGatewayHealth): void
}

const detailOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

/** Owns one official QQ SDK client until stopped; reconnect and heartbeats remain the SDK's protocol responsibility. */
export class OfficialGateway {
  private readonly stopped = new AbortController()
  private running?: Promise<void>
  constructor(private readonly options: Options) {}

  async start(): Promise<void> {
    const { appId, appSecret, client, instanceId, selfId, receive, report } = this.options
    if (!appId.trim() || !appSecret.trim()) throw new Error('QQ official credentials are required')
    report({ state: 'starting', detail: 'Connecting to QQ official gateway' })
    client.on('message', message => {
      const envelope = officialEnvelope(message, { instanceId, selfId })
      if (envelope) void Promise.resolve(receive(envelope)).catch(error => report({ state: 'error', detail: this.redact(detailOf(error)) }))
    })
    client.on('ready', () => { report({ state: 'ready', detail: 'QQ official gateway connected' }) })
    client.on('resumed', () => { report({ state: 'ready', detail: 'QQ official gateway resumed' }) })
    client.on('disconnected', event => { report({ state: event.willReconnect ? 'starting' : 'error', detail: this.redact(event.reason) }) })
    client.on('error', error => { report({ state: 'error', detail: this.redact(detailOf(error)) }) })
    this.running = client.start(this.stopped.signal)
    try { await this.running }
    catch (error) {
      report({ state: 'error', detail: this.redact(detailOf(error)) })
      throw error
    }
  }

  async stop(): Promise<void> {
    this.stopped.abort()
    this.options.client.stop()
    await this.running
  }

  private redact(value: string): string {
    return value.replaceAll(this.options.appSecret, '[redacted]').replaceAll(this.options.appId, '[app]')
  }
}
