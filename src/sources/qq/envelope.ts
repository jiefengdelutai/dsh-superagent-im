/** Transport-neutral QQ message data. Credentials and clients never enter this model. */
export type QqTransport = 'official' | 'onebot'

export interface QqIdentity {
  transport: QqTransport
  /** Stable local instance key: an official AppID or the connected personal QQ account. */
  instanceId: string
  /** Native identity used to recognize mentions and prevent reply loops. */
  actorId: string
}

export interface QqAttachment {
  type: 'image' | 'file' | 'audio' | 'video'
  id?: string
  name?: string
  url?: string
}

export type QqContentPart =
  | { type: 'text'; text: string }
  | { type: 'mention'; id: string; name?: string }
  | { type: 'attachment'; attachment: QqAttachment }
  | { type: 'unsupported'; nativeType: string }

export interface QqEnvelope {
  transport: QqTransport
  instanceId: string
  messageId: string
  conversation: { kind: 'direct' | 'group'; id: string }
  sender: { id: string; human: boolean }
  at: string
  text: string
  mentions: string[]
  attachments: QqAttachment[]
  replyTo?: string
  rootId?: string
  url?: string
}

const attachmentName: Record<QqAttachment['type'], string> = { image: '图片', file: '文件', audio: '语音', video: '视频' }

/** Converts validated message parts into untrusted display text and valid mention identities. */
export function qqText(parts: readonly QqContentPart[]): { text: string; mentions: string[] } {
  const mentions: string[] = []
  let text = ''
  for (const part of parts) {
    if (part.type === 'text') { text += part.text; continue }
    let rendered: string | undefined
    if (part.type === 'mention') {
      if (!part.id) continue
      mentions.push(part.id)
      rendered = `@${part.name || part.id}`
    } else if (part.type === 'attachment') {
      const label = attachmentName[part.attachment.type]
      rendered = `[${label}${part.attachment.name ? `: ${part.attachment.name}` : ''}]`
    } else {
      rendered = `[不支持的QQ消息: ${part.nativeType || 'unknown'}]`
    }
    text += `${text && !/\s$/.test(text) ? ' ' : ''}${rendered}`
  }
  return { text: text.trim(), mentions: [...new Set(mentions)] }
}
