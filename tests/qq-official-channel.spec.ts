import { describe, expect, it } from 'vitest'
import type { OutboundMessage } from '../src/core/index.ts'
import { OfficialApiError, qqChunks, sendOfficialQq, type OfficialMessageClient } from '../src/sources/qq/official/channel.ts'

class FakeMessages implements OfficialMessageClient {
  readonly sent: { target: { scope: 'c2c' | 'group'; targetId: string; msgId?: string }; text: string; idempotencyKey: string }[] = []
  error?: Error
  async sendText(target: { scope: 'c2c' | 'group'; targetId: string; msgId?: string }, text: string, options: { idempotencyKey: string }): Promise<void> {
    if (this.error) throw this.error
    this.sent.push({ target, text, idempotencyKey: options.idempotencyKey })
  }
}

const outbound = (address: Record<string, string>, text = 'done'): OutboundMessage => ({ id: 'reply-1', kind: 'reply', text,
  channel: { source: 'qq-official', thread: 'qq-official:t1', address } })

describe('official QQ channel', () => {
  it('sends passive replies to private and group targets', async () => {
    const client = new FakeMessages()
    await expect(sendOfficialQq(client, outbound({ instanceId: 'app-1', conversationType: 'direct', conversationId: 'u1', messageId: 'm1' }))).resolves.toBe('sent')
    await expect(sendOfficialQq(client, outbound({ instanceId: 'app-1', conversationType: 'group', conversationId: 'g1', messageId: 'm2' }))).resolves.toBe('sent')
    expect(client.sent.map(item => item.target)).toEqual([
      { scope: 'c2c', targetId: 'u1', msgId: 'm1' },
      { scope: 'group', targetId: 'g1', msgId: 'm2' },
    ])
  })

  it('splits long markdown on readable boundaries with stable per-chunk keys', async () => {
    expect(qqChunks('alpha beta gamma', 10)).toEqual(['alpha beta', 'gamma'])
    const client = new FakeMessages()
    await sendOfficialQq(client, outbound({ conversationType: 'direct', conversationId: 'u1', messageId: 'm1' }, 'alpha beta gamma'), 10)
    expect(client.sent.map(item => [item.text, item.idempotencyKey])).toEqual([['alpha beta', 'reply-1:0'], ['gamma', 'reply-1:1']])
  })

  it('returns gone only for a permanently missing target', async () => {
    const missing = new FakeMessages(); missing.error = new OfficialApiError('target missing', 404, 'MESSAGE_NOT_FOUND')
    await expect(sendOfficialQq(missing, outbound({ conversationType: 'group', conversationId: 'g1', messageId: 'm1' }))).resolves.toBe('gone')
    const limited = new FakeMessages(); limited.error = new OfficialApiError('retry later', 429, 'RATE_LIMITED')
    await expect(sendOfficialQq(limited, outbound({ conversationType: 'group', conversationId: 'g1', messageId: 'm1' }))).rejects.toThrow('retry later')
  })

  it('rejects invalid targets without leaking arbitrary address fields', async () => {
    const client = new FakeMessages()
    await expect(sendOfficialQq(client, outbound({ conversationType: 'guild', conversationId: 'x', messageId: 'm', appSecret: 'never-log-this' })))
      .rejects.toThrow('Invalid QQ official reply target')
    expect(client.sent).toEqual([])
  })
})
