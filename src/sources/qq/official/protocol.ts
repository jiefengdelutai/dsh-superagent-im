/** Validation and normalization at the QQ Open Platform boundary. */
import { z } from 'zod'
import type { QQBotInboundMessage } from '@tencent-connect/qqbot-nodejs'
import { qqText, type QqAttachment, type QqContentPart, type QqEnvelope } from '../envelope.ts'

const MentionSchema = z.looseObject({ id: z.string().min(1), name: z.string().optional() })
const AttachmentSchema = z.looseObject({ type: z.enum(['image', 'file', 'audio', 'video']), id: z.string().optional(),
  name: z.string().optional(), url: z.url().optional() })
const EventSchema = z.looseObject({
  id: z.string().min(1), scene: z.enum(['c2c', 'group']), targetId: z.string().min(1),
  author: z.looseObject({ id: z.string().min(1), bot: z.boolean().optional() }), content: z.string().default(''),
  timestamp: z.union([z.string(), z.number()]), mentions: z.array(z.unknown()).default([]), attachments: z.array(z.unknown()).default([]),
  replyTo: z.string().min(1).optional(), rootId: z.string().min(1).optional(), url: z.url().optional(),
})
export type OfficialEvent = z.infer<typeof EventSchema>
type OfficialSdkMessage = Pick<QQBotInboundMessage, 'kind' | 'messageId' | 'replyTarget' | 'senderId' | 'senderIsBot' | 'content'
  | 'timestamp' | 'mentions' | 'attachments' | 'refMsgIdx' | 'rawEventType'>

const attachmentType = (contentType: string): QqAttachment['type'] => {
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('audio/')) return 'audio'
  if (contentType.startsWith('video/')) return 'video'
  return 'file'
}

/** Adapts the official SDK's high-level inbound message to this connector's small protocol surface. */
export function officialSdkEvent(message: OfficialSdkMessage, selfId: string): OfficialEvent | undefined {
  if (message.kind !== 'c2c' && message.kind !== 'group') return
  const mentions = (message.mentions ?? []).flatMap(mention => {
    const id = mention.is_you ? selfId : mention.member_openid || mention.user_openid || mention.id
    return id ? [{ id, ...(mention.nickname || mention.username ? { name: mention.nickname || mention.username } : {}) }] : []
  })
  // Tencent emits GROUP_AT_MESSAGE_CREATE only for an @bot message; the structured list may be absent.
  if (message.kind === 'group' && message.rawEventType === 'GROUP_AT_MESSAGE_CREATE' && !mentions.some(mention => mention.id === selfId)) {
    mentions.push({ id: selfId })
  }
  return {
    id: message.messageId, scene: message.kind, targetId: message.replyTarget.targetId,
    author: { id: message.senderId, ...(message.senderIsBot !== undefined ? { bot: message.senderIsBot } : {}) },
    content: message.content, timestamp: message.timestamp,
    mentions,
    attachments: (message.attachments ?? []).map(attachment => ({ type: attachmentType(attachment.content_type),
      url: attachment.url, ...(attachment.filename ? { name: attachment.filename } : {}) })),
    ...(message.refMsgIdx ? { replyTo: message.refMsgIdx } : {}),
  }
}

const time = (value: string | number): string | undefined => {
  const parsed = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
}

/** Converts one supported private or group event into the shared QQ envelope. */
export function officialEnvelope(input: unknown, identity: { instanceId: string; selfId: string }): QqEnvelope | undefined {
  const parsed = EventSchema.safeParse(input)
  if (!parsed.success || parsed.data.author.id === identity.selfId) return
  const event = parsed.data
  const at = time(event.timestamp)
  if (!at) return
  const mentions = event.mentions.flatMap(item => {
    const mention = MentionSchema.safeParse(item)
    return mention.success ? [mention.data] : []
  })
  const attachments: QqAttachment[] = []
  const parts: QqContentPart[] = [...event.content ? [{ type: 'text' as const, text: event.content }] : [],
    ...mentions.map(mention => ({ type: 'mention' as const, id: mention.id, ...(mention.name ? { name: mention.name } : {}) }))]
  for (const item of event.attachments) {
    const attachment = AttachmentSchema.safeParse(item)
    if (attachment.success) {
      attachments.push(attachment.data)
      parts.push({ type: 'attachment', attachment: attachment.data })
    } else {
      const native = item && typeof item === 'object' && 'type' in item ? String(item.type) : 'unknown'
      parts.push({ type: 'unsupported', nativeType: `attachment:${native}` })
    }
  }
  const rendered = qqText(parts)
  return {
    transport: 'official', instanceId: identity.instanceId, messageId: event.id,
    conversation: { kind: event.scene === 'c2c' ? 'direct' : 'group', id: event.targetId },
    sender: { id: event.author.id, human: !event.author.bot }, at, text: rendered.text, mentions: rendered.mentions, attachments,
    ...(event.replyTo ? { replyTo: event.replyTo } : {}), ...(event.rootId ? { rootId: event.rootId } : {}),
    ...(event.url ? { url: event.url } : {}),
  }
}
