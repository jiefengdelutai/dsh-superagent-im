/** NapCat runtime composition and the production reverse-WebSocket adapter. */
import { WebSocketServer, type RawData, type WebSocket } from 'ws'
import type { Context } from '@deepseek-ai/cordis'
import type { QqEnvelope } from '../envelope.ts'
import { qqTrigger } from '../mapping.ts'
import { bindOneBotQqClient, oneBotQqKind, type OneBotQqConfig } from '../kind.ts'
import { sourceContext } from '../../host.ts'
import { OneBotClient } from './client.ts'
import { OneBotGateway, type OneBotGatewayHealth, type OneBotServer, type OneBotSocket } from './gateway.ts'

/** Adapts a ws socket to the gateway's transport-neutral socket port. */
class WsSocket implements OneBotSocket {
  constructor(private readonly socket: WebSocket) {}
  onMessage(handler: (value: string | Uint8Array) => void): void {
    this.socket.on('message', (data: RawData, binary: boolean) => handler(binary ? new Uint8Array(data as Buffer) : data.toString()))
  }
  onClose(handler: () => void): void { this.socket.on('close', handler) }
  close(code?: number, reason?: string): void { this.socket.close(code, reason) }
}

/** A localhost-by-default reverse-WebSocket listener suitable for NapCat. */
export class NodeOneBotServer implements OneBotServer {
  private readonly server: WebSocketServer
  constructor(options: { host?: string; port: number; path?: string }) {
    this.server = new WebSocketServer({ host: options.host ?? '127.0.0.1', port: options.port, path: options.path ?? '/onebot/v11' })
  }
  onConnection(handler: (socket: OneBotSocket, headers: Readonly<Record<string, string | undefined>>) => void): void {
    this.server.on('connection', (socket, request) => handler(new WsSocket(socket), {
      authorization: Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization,
    }))
  }
  close(): Promise<void> {
    for (const client of this.server.clients) client.close(1001, 'shutdown')
    return new Promise((resolve, reject) => this.server.close(error => error ? reject(error) : resolve()))
  }
}

export interface OneBotRuntimeOptions {
  instanceId: string
  selfId: string
  token: string
  endpoint: string
  host?: string
  port?: number
  path?: string
  maxBytes?: number
  server?: OneBotServer
  receive(envelope: QqEnvelope): void | Promise<void>
  report(health: OneBotGatewayHealth): void
}

/** Creates one isolated personal-QQ runtime; Source registration is composed by the shared QQ kind. */
export function createOneBotRuntime(options: OneBotRuntimeOptions): { client: OneBotClient; gateway: OneBotGateway } {
  const server = options.server ?? new NodeOneBotServer({ host: options.host, port: options.port ?? 6700, path: options.path })
  const client = new OneBotClient({ endpoint: options.endpoint, token: options.token })
  const gateway = new OneBotGateway({ server, token: options.token, identity: { instanceId: options.instanceId, selfId: options.selfId },
    maxBytes: options.maxBytes, receive: options.receive, report: options.report })
  return { client, gateway }
}

export const name = 'dsh-superagent-im-qq-onebot'
export const inject = ['orchestrator']
/** Registers and runs the NapCat/OneBot Source for one personal QQ account. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.orchestrator.sources.register(oneBotQqKind), 'qq onebot: source kind')
  ctx.effect(() => {
    const source = sourceContext(ctx.orchestrator, oneBotQqKind)
    const config = source.config<OneBotQqConfig>(oneBotQqKind.kind)
    if (!config) { source.report('qq-onebot', { state: 'paused', detail: 'Off' }); return () => {} }
    if (!config.accountId || !config.token) {
      source.report('qq-onebot', { state: 'error', detail: 'QQ account and access token are required' }); return () => {}
    }
    const runtime = createOneBotRuntime({ ...config, instanceId: config.accountId, selfId: config.accountId,
      receive: async envelope => { const trigger = qqTrigger(envelope, { transport: 'onebot', instanceId: config.accountId, actorId: config.accountId }); if (trigger) await source.receive(trigger) },
      report: health => source.report('qq-onebot', health) })
    bindOneBotQqClient(config.accountId, runtime.client)
    runtime.gateway.start()
    return async () => { bindOneBotQqClient(config.accountId, undefined); await runtime.gateway.stop() }
  })
}
