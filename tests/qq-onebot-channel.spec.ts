import { describe, expect, it, vi } from 'vitest'
import type { OutboundMessage } from '../src/core/index.ts'
import { OneBotClient, OneBotError, type OneBotFetch } from '../src/sources/qq/onebot/client.ts'
import { sendOneBotQq } from '../src/sources/qq/onebot/channel.ts'

const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status,
  json: async () => body }) as Response
const outbound = (conversationType: string, conversationId = '20000'): OutboundMessage => ({ id: 'reply-1', kind: 'reply', text: 'done',
  channel: { source: 'qq-onebot', thread: 'qq-onebot:t1', address: { instanceId: '10000', conversationType, conversationId, messageId: '1' } } })

describe('OneBot HTTP client and channel', () => {
  it('calls private and group send actions without putting the token in request bodies', async () => {
    const fetcher = vi.fn<OneBotFetch>().mockResolvedValue(response({ status: 'ok', retcode: 0, data: { message_id: 9 } }))
    const client = new OneBotClient({ endpoint: 'http://127.0.0.1:3000', token: 'secret-token', fetcher })
    await sendOneBotQq(client, outbound('direct'))
    await sendOneBotQq(client, outbound('group', '30000'))
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      'http://127.0.0.1:3000/send_private_msg', 'http://127.0.0.1:3000/send_group_msg',
    ])
    expect(fetcher.mock.calls.map(call => JSON.parse(String(call[1]?.body)))).toEqual([
      { user_id: '20000', message: 'done' }, { group_id: '30000', message: 'done' },
    ])
    expect(JSON.stringify(fetcher.mock.calls.map(call => call[1]?.body))).not.toContain('secret-token')
  })

  it('classifies missing targets as gone and retries other OneBot failures', async () => {
    const missing = vi.fn<OneBotFetch>().mockResolvedValue(response({ status: 'failed', retcode: 100, message: 'group not found' }))
    await expect(sendOneBotQq(new OneBotClient({ endpoint: 'http://localhost:3000', token: 'x', fetcher: missing }), outbound('group', '0'))).resolves.toBe('gone')
    const limited = vi.fn<OneBotFetch>().mockResolvedValue(response({ status: 'failed', retcode: 1200, message: 'rate limited' }))
    await expect(sendOneBotQq(new OneBotClient({ endpoint: 'http://localhost:3000', token: 'x', fetcher: limited }), outbound('direct'))).rejects.toThrow('rate limited')
  })

  it('bounds requests and redacts access tokens from errors', async () => {
    const fetcher = vi.fn<OneBotFetch>().mockRejectedValue(new Error('request secret-token failed'))
    const client = new OneBotClient({ endpoint: 'http://localhost:3000', token: 'secret-token', timeoutMs: 10, fetcher })
    await expect(client.call('send_private_msg', { user_id: '2', message: 'x' })).rejects.not.toThrow('secret-token')
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('rejects invalid channel targets before making a request', async () => {
    const client = { call: vi.fn() }
    await expect(sendOneBotQq(client, outbound('guild'))).rejects.toThrow('Invalid OneBot reply target')
    expect(client.call).not.toHaveBeenCalled()
    expect(new OneBotError('x', 1).retcode).toBe(1)
  })
})
