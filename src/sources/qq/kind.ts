/** SourceKind definitions shared by official QQ Bot and NapCat/OneBot runtimes. */
import { z } from 'zod'
import type { ScopeResult } from '../../core/index.ts'
import type { FieldSpec, SourceKind } from '../kind.ts'
import { sendOfficialQq, type OfficialMessageClient } from './official/channel.ts'
import { sendOneBotQq, type OneBotActions } from './onebot/channel.ts'

const Listen = z.enum(['mentions', 'all'])
const Groups = (id: z.ZodString) => z.array(z.object({ id, name: z.string().trim().max(80).optional(), listen: Listen }).strict())
  .refine(rows => new Set(rows.map(row => row.id)).size === rows.length, 'Duplicate QQ group IDs').default([])
const common = {
  directMessages: z.boolean().default(true),
  otherGroups: z.enum(['none', 'mentions']).default('none'),
}

export const OfficialQqConfigSchema = z.object({
  appId: z.string().trim().regex(/^[^:\s]*$/).default(''), appSecret: z.string().default(''),
  botOpenId: z.string().trim().regex(/^[^:\s]*$/).default(''), groups: Groups(z.string().trim().min(1)), ...common,
}).strict()
export type OfficialQqConfig = z.infer<typeof OfficialQqConfigSchema>

export const OneBotQqConfigSchema = z.object({
  accountId: z.string().regex(/^\d*$/).default(''), token: z.string().default(''),
  endpoint: z.url().default('http://127.0.0.1:3000'), host: z.string().default('127.0.0.1'),
  port: z.number().int().min(1).max(65535).default(6700), path: z.string().regex(/^\/.+/).default('/onebot/v11'),
  groups: Groups(z.string().regex(/^\d+$/)), ...common,
}).strict()
export type OneBotQqConfig = z.infer<typeof OneBotQqConfigSchema>

const officialClients = new Map<string, OfficialMessageClient>()
const oneBotClients = new Map<string, OneBotActions>()
export const bindOfficialQqClient = (id: string, client: OfficialMessageClient | undefined): void => {
  if (client) officialClients.set(id, client); else officialClients.delete(id)
}
export const bindOneBotQqClient = (id: string, client: OneBotActions | undefined): void => {
  if (client) oneBotClients.set(id, client); else oneBotClients.delete(id)
}

const scope = (meta: Record<string, unknown>, config: { directMessages: boolean; otherGroups: 'none' | 'mentions'; groups: { id: string; listen: 'mentions' | 'all' }[] }): ScopeResult => {
  if (meta.conversationType === 'direct') return config.directMessages
    ? { listened: true, observed: false, row: 'direct' } as const : { listened: false, reason: 'direct_messages_not_allowed' } as const
  const group = config.groups.find(row => row.id === meta.conversationId)
  if (group) return { listened: true, observed: group.listen === 'all', row: group.id }
  return config.otherGroups === 'mentions' ? { listened: true, observed: false, row: 'other' } as const
    : { listened: false, reason: 'group_not_allowed' } as const
}
const allowed = (address: Record<string, string>, config: { appId?: string; accountId?: string; directMessages: boolean; otherGroups: 'none' | 'mentions'; groups: { id: string; listen: 'mentions' | 'all' }[] }) =>
  address.instanceId === (config.appId ?? config.accountId)
  && scope({ conversationType: address.conversationType, conversationId: address.conversationId }, config).listened
const rows = (config: { directMessages: boolean; otherGroups: 'none' | 'mentions'; groups: { id: string; name?: string; listen: 'mentions' | 'all' }[] }) => [
  ...config.groups.map(group => ({ id: group.id, label: group.name || group.id,
    note: group.listen === 'all' ? { zh: '全部消息', en: 'All messages' } : { zh: '仅 @', en: '@ only' },
    cells: { listedUnaddressed: group.listen === 'all', unlistedAddressed: true, unlistedUnaddressed: group.listen === 'all' } })),
  { id: 'other', label: { zh: '其他群', en: 'Other groups' }, note: config.otherGroups === 'mentions' ? { zh: '仅 @', en: '@ only' } : { zh: '不接收', en: 'Not received' },
    cells: { listedUnaddressed: false, unlistedAddressed: config.otherGroups === 'mentions', unlistedUnaddressed: false } },
  { id: 'direct', label: { zh: '私聊', en: 'Direct messages' }, note: config.directMessages ? { zh: '接收', en: 'Received' } : { zh: '不接收', en: 'Not received' },
    cells: { listedUnaddressed: false, unlistedAddressed: config.directMessages, unlistedUnaddressed: false } },
]
const groupFields: FieldSpec[] = [
  { key: 'groups', type: 'rows', label: { zh: '接收的群', en: 'Received groups' }, columns: [
    { key: 'id', type: 'text', label: { zh: '群 ID', en: 'Group ID' } }, { key: 'name', type: 'text', label: { zh: '名称', en: 'Name' }, optional: true },
    { key: 'listen', type: 'select', label: { zh: '接收', en: 'Receive' }, options: [{ value: 'mentions', label: { zh: '仅 @', en: '@ only' } }, { value: 'all', label: { zh: '全部消息', en: 'All messages' } }] },
  ] },
  { key: 'otherGroups', type: 'select', label: { zh: '其他群', en: 'Other groups' }, options: [{ value: 'none', label: { zh: '不接收', en: 'Not received' } }, { value: 'mentions', label: { zh: '仅 @', en: '@ only' } }] },
  { key: 'directMessages', type: 'switch', label: { zh: '接收私聊', en: 'Receive direct messages' } },
]

export const officialQqKind: SourceKind<OfficialQqConfig> = {
  kind: 'qq-official', title: { zh: 'QQ 官方机器人', en: 'QQ Official Bot' },
  description: { zh: '通过 QQ 开放平台接收群聊和私聊。', en: 'Receives groups and direct messages through QQ Open Platform.' },
  schema: OfficialQqConfigSchema, health: ['qq-official'],
  fields: [
    { key: 'appId', type: 'text', label: { zh: 'AppID', en: 'AppID' } },
    { key: 'appSecret', type: 'secret', label: { zh: 'AppSecret', en: 'AppSecret' } },
    { key: 'botOpenId', type: 'text', label: { zh: '机器人 OpenID', en: 'Bot OpenID' } }, ...groupFields,
  ],
  scope: ({ meta }, config) => scope(meta, config),
  channel: { allowed, send: async (_host, message) => {
    const client = officialClients.get(message.channel.address.instanceId ?? '')
    if (!client) throw new Error('QQ official runtime is not connected')
    return sendOfficialQq(client, message)
  }, link: () => ({ url: '', label: { zh: 'QQ 官方机器人', en: 'QQ Official Bot' } }) },
  policy: { schema: z.object({ allowed: z.array(z.object({ id: z.string().regex(/^[^:\s]+:[^:\s]+$/), name: z.string().trim().max(100).optional() }).strict()).default([]) }).strict(),
    fields: [{ key: 'allowed', type: 'rows', label: { zh: '能发起工作的 QQ 用户', en: 'QQ users who may originate work' }, columns: [
      { key: 'id', type: 'text', label: { zh: 'AppID:OpenID', en: 'AppID:OpenID' } }, { key: 'name', type: 'text', label: { zh: '名称', en: 'Name' }, optional: true }] }],
    explicit: { zh: '名单内用户私聊或在群里 @ 机器人时是明确请求。', en: 'A listed user makes an explicit request by direct message or mentioning the bot.' },
    rows: stored => rows(OfficialQqConfigSchema.parse(stored)) },
}

export const oneBotQqKind: SourceKind<OneBotQqConfig> = {
  kind: 'qq-onebot', title: { zh: '个人 QQ（NapCat）', en: 'Personal QQ (NapCat)' },
  description: { zh: '通过 NapCat / OneBot v11 接入个人 QQ。', en: 'Connects a personal QQ account through NapCat / OneBot v11.' },
  schema: OneBotQqConfigSchema, health: ['qq-onebot'],
  fields: [
    { key: 'accountId', type: 'text', pattern: '\\d+', label: { zh: '机器人 QQ 号', en: 'Bot QQ number' } },
    { key: 'token', type: 'secret', label: { zh: '访问令牌', en: 'Access token' } },
    { key: 'endpoint', type: 'text', label: { zh: 'NapCat HTTP 地址', en: 'NapCat HTTP endpoint' } },
    { key: 'host', type: 'text', advanced: true, label: { zh: '反向 WS 监听地址', en: 'Reverse WS host' } },
    { key: 'port', type: 'number', advanced: true, min: 1, max: 65535, label: { zh: '反向 WS 端口', en: 'Reverse WS port' } },
    { key: 'path', type: 'text', advanced: true, label: { zh: '反向 WS 路径', en: 'Reverse WS path' } }, ...groupFields,
  ],
  scope: ({ meta }, config) => scope(meta, config),
  channel: { allowed, send: async (_host, message) => {
    const client = oneBotClients.get(message.channel.address.instanceId ?? '')
    if (!client) throw new Error('OneBot runtime is not connected')
    return sendOneBotQq(client, message)
  }, link: () => ({ url: '', label: { zh: '个人 QQ', en: 'Personal QQ' } }) },
  policy: { schema: z.object({ allowed: z.array(z.object({ id: z.string().regex(/^\d+:\d+$/), name: z.string().trim().max(100).optional() }).strict()).default([]) }).strict(),
    fields: [{ key: 'allowed', type: 'rows', label: { zh: '能发起工作的 QQ 用户', en: 'QQ users who may originate work' }, columns: [
      { key: 'id', type: 'text', label: { zh: '机器人QQ:用户QQ', en: 'Bot QQ:User QQ' }, pattern: '\\d+:\\d+' }, { key: 'name', type: 'text', label: { zh: '名称', en: 'Name' }, optional: true }] }],
    explicit: { zh: '名单内用户私聊或在群里 @ 机器人时是明确请求。', en: 'A listed user makes an explicit request by direct message or mentioning the bot.' },
    rows: stored => rows(OneBotQqConfigSchema.parse(stored)) },
}
