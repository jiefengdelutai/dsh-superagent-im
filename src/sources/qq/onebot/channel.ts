/** Outbound delivery through OneBot v11 actions. */
import type { OutboundMessage } from '../../../core/index.ts'
import { OneBotError } from './client.ts'

export interface OneBotActions { call(action: string, params: Record<string, unknown>): Promise<unknown> }

const missing = (error: unknown): boolean => error instanceof OneBotError
  && (error.retcode === 100 || /(?:not found|不存在|已退出)/i.test(error.message))

/** Sends a private or group reply; retryable failures remain errors for the Outbox. */
export async function sendOneBotQq(client: OneBotActions, message: OutboundMessage): Promise<'sent' | 'gone'> {
  const { conversationType, conversationId } = message.channel.address
  if ((conversationType !== 'direct' && conversationType !== 'group') || !conversationId) throw new Error('Invalid OneBot reply target')
  try {
    if (conversationType === 'direct') await client.call('send_private_msg', { user_id: conversationId, message: message.text })
    else await client.call('send_group_msg', { group_id: conversationId, message: message.text })
  } catch (error) {
    if (missing(error)) return 'gone'
    throw error
  }
  return 'sent'
}
