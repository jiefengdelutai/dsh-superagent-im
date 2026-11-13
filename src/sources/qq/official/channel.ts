/** Outbound delivery through the QQ Open Platform client. */
import type { OutboundMessage } from '../../../core/index.ts'

export interface OfficialReplyTarget { scope: 'c2c' | 'group'; targetId: string; msgId?: string }
export interface OfficialMessageClient {
  sendText(target: OfficialReplyTarget, text: string, options: { idempotencyKey: string }): Promise<void>
}

/** Structured official-platform delivery failure used for retry classification. */
export class OfficialApiError extends Error {
  constructor(message: string, readonly status?: number, readonly code?: string) { super(message) }
}

/** Splits text without cutting a word when the current chunk contains a usable boundary. */
export function qqChunks(text: string, limit = 4500): string[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('QQ chunk limit must be a positive integer')
  const chunks: string[] = []
  let rest = text.trim()
  while (rest.length > limit) {
    const window = rest.slice(0, limit + 1)
    const boundary = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '))
    const cut = boundary > 0 ? boundary : limit
    chunks.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  if (rest) chunks.push(rest)
  return chunks
}

const gone = (error: unknown): boolean => error instanceof OfficialApiError
  && (error.status === 404 || error.code === 'MESSAGE_NOT_FOUND' || error.code === 'TARGET_NOT_FOUND')

/** Sends a passive reply in stable chunks; retryable platform failures are thrown for the Outbox to retry. */
export async function sendOfficialQq(client: OfficialMessageClient, message: OutboundMessage, limit = 4500): Promise<'sent' | 'gone'> {
  const { conversationType, conversationId, messageId } = message.channel.address
  if ((conversationType !== 'direct' && conversationType !== 'group') || !conversationId || !messageId) {
    throw new Error('Invalid QQ official reply target')
  }
  const target: OfficialReplyTarget = { scope: conversationType === 'direct' ? 'c2c' : 'group', targetId: conversationId, msgId: messageId }
  try {
    const chunks = qqChunks(message.text, limit)
    for (const [index, text] of chunks.entries()) await client.sendText(target, text, { idempotencyKey: `${message.id}:${index}` })
  } catch (error) {
    if (gone(error)) return 'gone'
    throw error
  }
  return 'sent'
}
