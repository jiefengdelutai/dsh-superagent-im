/** Validation and safe normalization of NapCat's OneBot v11 message events. */
import { z } from 'zod'
import { qqText, type QqAttachment, type QqContentPart, type QqEnvelope } from '../envelope.ts'

const Id = z.union([z.string().min(1), z.number().finite()]).transform(String)
const Segment = z.looseObject({ type: z.string().min(1), data: z.record(z.string(), z.unknown()).default({}) })
const Message = z.union([z.string(), z.array(Segment)])
const Event = z.looseObject({
  post_type: z.literal('message'), message_type: z.enum(['private', 'group']), self_id: Id, user_id: Id,
  group_id: Id.optional(), message_id: Id, time: z.number().finite(), message: Message, anonymous: z.unknown().optional(),
})

const text = (value: unknown): string | undefined => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined
const url = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return
  try { const parsed = new URL(value); return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : undefined }
  catch { return }
}

function attachment(type: QqAttachment['type'], data: Record<string, unknown>): QqAttachment | undefined {
  const name = text(data.file) || text(data.name), id = text(data.file_id) || text(data.id), address = url(data.url)
  if (!name && !id && !address) return
  return { type, ...(id ? { id } : {}), ...(name ? { name } : {}), ...(address ? { url: address } : {}) }
}

function parts(message: z.infer<typeof Message>): { content: QqContentPart[]; attachments: QqAttachment[]; replyTo?: string } {
  if (typeof message === 'string') return { content: [{ type: 'text', text: message }], attachments: [] }
  const content: QqContentPart[] = [], attachments: QqAttachment[] = []
  let replyTo: string | undefined
  for (const segment of message) {
    const data = segment.data
    if (segment.type === 'text') { const value = text(data.text); if (value) content.push({ type: 'text', text: value }); continue }
    if (segment.type === 'at') { const id = text(data.qq); if (id) content.push({ type: 'mention', id, ...(text(data.name) ? { name: text(data.name) } : {}) }); continue }
    if (segment.type === 'reply') { replyTo ??= text(data.id); continue }
    const kind = segment.type === 'image' ? 'image' : segment.type === 'file' ? 'file'
      : segment.type === 'record' ? 'audio' : segment.type === 'video' ? 'video' : undefined
    if (kind) {
      const item = attachment(kind, data)
      if (item) { attachments.push(item); content.push({ type: 'attachment', attachment: item }) }
      else content.push({ type: 'unsupported', nativeType: segment.type })
      continue
    }
    content.push({ type: 'unsupported', nativeType: segment.type })
  }
  return { content, attachments, ...(replyTo ? { replyTo } : {}) }
}

/** Converts a supported OneBot message event into the shared QQ envelope. */
export function oneBotEnvelope(input: unknown, identity: { instanceId: string; selfId: string }): QqEnvelope | undefined {
  const parsed = Event.safeParse(input)
  if (!parsed.success) return
  const event = parsed.data
  if (event.self_id !== identity.selfId || event.user_id === identity.selfId || event.anonymous !== undefined) return
  if (event.message_type === 'group' && !event.group_id) return
  const converted = parts(event.message)
  const rendered = qqText(converted.content)
  const conversationId = event.message_type === 'group' ? event.group_id! : event.user_id
  return {
    transport: 'onebot', instanceId: identity.instanceId, messageId: event.message_id,
    conversation: { kind: event.message_type === 'group' ? 'group' : 'direct', id: conversationId },
    sender: { id: event.user_id, human: true }, at: new Date(event.time * 1000).toISOString(), text: rendered.text,
    mentions: rendered.mentions, attachments: converted.attachments,
    ...(converted.replyTo ? { replyTo: converted.replyTo, rootId: converted.replyTo } : {}),
  }
}
