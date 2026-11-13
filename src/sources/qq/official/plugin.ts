/** Tencent SDK composition kept behind a small, testable connector boundary. */
import { QQBot, type QQBotInboundMessage } from '@tencent-connect/qqbot-nodejs'
import type { Context } from '@deepseek-ai/cordis'
import type { QqEnvelope } from '../envelope.ts'
import { qqTrigger } from '../mapping.ts'
import { bindOfficialQqClient, officialQqKind, type OfficialQqConfig } from '../kind.ts'
import { sourceContext } from '../../host.ts'
import { OfficialApiError, type OfficialMessageClient, type OfficialReplyTarget } from './channel.ts'
import { OfficialGateway, type OfficialBotClient, type OfficialBotEventMap, type OfficialGatewayHealth } from './gateway.ts'
import { officialSdkEvent } from './protocol.ts'

export interface TencentBotPort {
  on(event: string, handler: (...values: unknown[]) => unknown): this
  start(signal?: AbortSignal): Promise<void>
  stop(): void
  sendText(target: unknown, text: string): Promise<unknown>
}

type Handler<K extends keyof OfficialBotEventMap> = (value: OfficialBotEventMap[K]) => void

/** Translates Tencent's two-argument message callback into the connector's event model. */
export class TencentOfficialClient implements OfficialBotClient, OfficialMessageClient {
  private readonly delivered = new Set<string>()
  constructor(private readonly bot: TencentBotPort, private readonly selfId: string) {}

  on<K extends keyof OfficialBotEventMap>(event: K, handler: Handler<K>): this {
    if (event === 'message') {
      this.bot.on(event, (_context, value) => {
        const adapted = officialSdkEvent(value as QQBotInboundMessage, this.selfId)
        if (adapted) (handler as Handler<'message'>)(adapted)
      })
    } else if (event === 'ready' || event === 'resumed') {
      this.bot.on(event, () => (handler as Handler<'ready'>)(undefined))
    } else {
      this.bot.on(event, value => (handler as (item: unknown) => void)(value))
    }
    return this
  }

  start(signal: AbortSignal): Promise<void> { return this.bot.start(signal) }
  stop(): void { this.bot.stop() }

  async sendText(target: OfficialReplyTarget, text: string, options: { idempotencyKey: string }): Promise<void> {
    if (this.delivered.has(options.idempotencyKey)) return
    try {
      await this.bot.sendText(target, text)
      this.delivered.add(options.idempotencyKey)
    } catch (error) {
      if (isTencentApiError(error)) throw new OfficialApiError(error.message, error.httpStatus, error.bizCode === undefined ? undefined : String(error.bizCode))
      throw error
    }
  }
}

interface TencentError extends Error { httpStatus: number; bizCode?: number }
const isTencentApiError = (value: unknown): value is TencentError => value instanceof Error
  && 'httpStatus' in value && typeof value.httpStatus === 'number'

export interface OfficialRuntimeOptions {
  appId: string
  appSecret: string
  instanceId: string
  selfId: string
  receive(envelope: QqEnvelope): void | Promise<void>
  report(health: OfficialGatewayHealth): void
  bot?: TencentBotPort
}

/** Creates one isolated official QQ account runtime; Cordis registration is composed by the source plugin. */
export function createOfficialRuntime(options: OfficialRuntimeOptions): { client: TencentOfficialClient; gateway: OfficialGateway } {
  const native = options.bot ?? new QQBot({ appId: options.appId, appSecret: options.appSecret, accountId: options.instanceId,
    baseUrl: 'https://api.bot.qq.com', tokenBaseUrl: 'https://api.bot.qq.com',
    markdownSupport: false, reconnect: { maxAttempts: 10 } }) as unknown as TencentBotPort
  const client = new TencentOfficialClient(native, options.selfId)
  return { client, gateway: new OfficialGateway({ ...options, client }) }
}

export const name = 'dsh-superagent-im-qq-official'
export const inject = ['orchestrator']
/** Registers and runs the official QQ Source for the configured account. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.orchestrator.sources.register(officialQqKind), 'qq official: source kind')
  ctx.effect(() => {
    const source = sourceContext(ctx.orchestrator, officialQqKind)
    const config = source.config<OfficialQqConfig>(officialQqKind.kind)
    if (!config) { source.report('qq-official', { state: 'paused', detail: 'Off' }); return () => {} }
    if (!config.appId || !config.appSecret || !config.botOpenId) {
      source.report('qq-official', { state: 'error', detail: 'AppID, AppSecret and bot OpenID are required' }); return () => {}
    }
    const runtime = createOfficialRuntime({ ...config, instanceId: config.appId, selfId: config.botOpenId,
      receive: async envelope => { const trigger = qqTrigger(envelope, { transport: 'official', instanceId: config.appId, actorId: config.botOpenId }); if (trigger) await source.receive(trigger) },
      report: health => source.report('qq-official', health) })
    bindOfficialQqClient(config.appId, runtime.client)
    // OfficialGateway already reports a credential-redacted failure before rejecting.
    const running = runtime.gateway.start().catch(() => {})
    return async () => { bindOfficialQqClient(config.appId, undefined); await runtime.gateway.stop(); await running }
  })
}
