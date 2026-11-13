import { describe, expect, it, vi } from 'vitest'
import { OfficialGateway, type OfficialBotClient, type OfficialBotEventMap } from '../src/sources/qq/official/gateway.ts'
import { TencentOfficialClient, createOfficialRuntime, type TencentBotPort } from '../src/sources/qq/official/plugin.ts'

class FakeBot implements OfficialBotClient {
  private readonly handlers = new Map<keyof OfficialBotEventMap, ((value: never) => void)[]>()
  stopped = false
  signal?: AbortSignal
  on<K extends keyof OfficialBotEventMap>(event: K, handler: (value: OfficialBotEventMap[K]) => void): this {
    const current = this.handlers.get(event) ?? []
    current.push(handler as (value: never) => void)
    this.handlers.set(event, current)
    return this
  }
  emit<K extends keyof OfficialBotEventMap>(event: K, value: OfficialBotEventMap[K]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(value as never)
  }
  async start(signal: AbortSignal): Promise<void> {
    this.signal = signal
    await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
  }
  stop(): void { this.stopped = true }
}

class FakeTencentBot implements TencentBotPort {
  private readonly handlers = new Map<string, ((...values: unknown[]) => unknown)[]>()
  readonly sent: { target: unknown; text: string }[] = []
  stopped = false
  on(event: string, handler: (...values: unknown[]) => unknown): this {
    this.handlers.set(event, [...this.handlers.get(event) ?? [], handler])
    return this
  }
  emit(event: string, ...values: unknown[]): void { for (const handler of this.handlers.get(event) ?? []) handler(...values) }
  async start(signal?: AbortSignal): Promise<void> {
    await new Promise<void>(resolve => signal?.addEventListener('abort', () => resolve(), { once: true }))
  }
  stop(): void { this.stopped = true }
  async sendText(target: unknown, text: string): Promise<unknown> { this.sent.push({ target, text }); return { id: 'sent-1' } }
}

const config = { appId: 'app-1', appSecret: 'super-secret', instanceId: 'app-1', selfId: 'bot-openid' }

describe('official QQ gateway', () => {
  it('refuses to start without complete credentials', async () => {
    const gateway = new OfficialGateway({ ...config, appSecret: '', client: new FakeBot(), receive: vi.fn(), report: vi.fn() })
    await expect(gateway.start()).rejects.toThrow('QQ official credentials are required')
  })

  it('delivers normalized messages and ignores unsupported events', async () => {
    const client = new FakeBot(), receive = vi.fn()
    const gateway = new OfficialGateway({ ...config, client, receive, report: vi.fn() })
    const running = gateway.start()
    client.emit('message', { id: 'm1', scene: 'c2c', targetId: 'u1', author: { id: 'u1' }, content: 'hello', timestamp: '2026-11-10T08:00:00Z' })
    client.emit('message', { type: 'ready' })
    expect(receive).toHaveBeenCalledTimes(1)
    expect(receive.mock.calls[0]![0]).toMatchObject({ transport: 'official', messageId: 'm1', text: 'hello' })
    await gateway.stop()
    await running
  })

  it('reports ready, reconnecting and resumed health transitions', async () => {
    const client = new FakeBot(), report = vi.fn()
    const gateway = new OfficialGateway({ ...config, client, receive: vi.fn(), report })
    const running = gateway.start()
    client.emit('ready', undefined)
    client.emit('disconnected', { code: 1006, reason: 'network', willReconnect: true })
    client.emit('resumed', undefined)
    expect(report.mock.calls.map(call => call[0].state)).toEqual(['starting', 'ready', 'starting', 'ready'])
    await gateway.stop()
    await running
  })

  it('redacts credentials from reported errors and stops cleanly', async () => {
    const client = new FakeBot(), report = vi.fn()
    const gateway = new OfficialGateway({ ...config, client, receive: vi.fn(), report })
    const running = gateway.start()
    client.emit('error', new Error('token super-secret rejected for app-1'))
    expect(JSON.stringify(report.mock.calls.at(-1)?.[0])).not.toContain('super-secret')
    await gateway.stop()
    await running
    expect(client.stopped).toBe(true)
    expect(client.signal?.aborted).toBe(true)
  })

  it('adapts the Tencent SDK event signature and deduplicates one-process retries', async () => {
    const bot = new FakeTencentBot(), client = new TencentOfficialClient(bot, 'bot-openid'), message = vi.fn()
    client.on('message', message)
    bot.emit('message', {}, { kind: 'c2c', senderId: 'u1', content: 'hello', messageId: 'm1',
      timestamp: '2026-11-10T08:00:00Z', replyTarget: { scope: 'c2c', targetId: 'u1', msgId: 'm1' } })
    expect(message).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1', scene: 'c2c', targetId: 'u1' }))
    await client.sendText({ scope: 'c2c', targetId: 'u1', msgId: 'm1' }, 'done', { idempotencyKey: 'reply-1:0' })
    await client.sendText({ scope: 'c2c', targetId: 'u1', msgId: 'm1' }, 'done', { idempotencyKey: 'reply-1:0' })
    expect(bot.sent).toHaveLength(1)
  })

  it('builds one official runtime around a supplied SDK client', () => {
    const bot = new FakeTencentBot()
    const runtime = createOfficialRuntime({ ...config, receive: vi.fn(), report: vi.fn(), bot })
    expect(runtime.client).toBeInstanceOf(TencentOfficialClient)
    expect(runtime.gateway).toBeInstanceOf(OfficialGateway)
  })
})
