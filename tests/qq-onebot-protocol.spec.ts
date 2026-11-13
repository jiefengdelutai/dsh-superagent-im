import { describe, expect, it } from 'vitest'
import { oneBotEnvelope } from '../src/sources/qq/onebot/protocol.ts'

const identity = { instanceId: '10000', selfId: '10000' }

describe('OneBot v11 QQ protocol', () => {
  it('normalizes private text and numeric identities', () => {
    expect(oneBotEnvelope({ post_type: 'message', message_type: 'private', self_id: 10000, user_id: 20000,
      message_id: 31, time: 1794297600, message: [{ type: 'text', data: { text: '你好' } }] }, identity)).toEqual({
      transport: 'onebot', instanceId: '10000', messageId: '31', conversation: { kind: 'direct', id: '20000' },
      sender: { id: '20000', human: true }, at: '2026-11-10T08:00:00.000Z', text: '你好', mentions: [], attachments: [],
    })
  })

  it('normalizes group mentions, reply roots and supported attachments', () => {
    expect(oneBotEnvelope({ post_type: 'message', message_type: 'group', self_id: 10000, user_id: 20000, group_id: 30000,
      message_id: 32, time: 1794297600, message: [
        { type: 'at', data: { qq: '10000', name: '助手' } }, { type: 'text', data: { text: ' 看看' } },
        { type: 'reply', data: { id: '20' } }, { type: 'image', data: { file: 'a.png', url: 'https://example.test/a.png' } },
        { type: 'file', data: { file: 'report.pdf', file_id: 'f1' } },
      ] }, identity)).toMatchObject({
      conversation: { kind: 'group', id: '30000' }, messageId: '32', replyTo: '20', rootId: '20',
      text: '@助手 看看 [图片: a.png] [文件: report.pdf]', mentions: ['10000'],
      attachments: [{ type: 'image', name: 'a.png', url: 'https://example.test/a.png' }, { type: 'file', id: 'f1', name: 'report.pdf' }],
    })
  })

  it('preserves unsupported segments as safe summaries', () => {
    expect(oneBotEnvelope({ post_type: 'message', message_type: 'private', self_id: 10000, user_id: 20000,
      message_id: 33, time: 1794297600, message: [{ type: 'json', data: { data: '{"secret":"ignored"}' } }] }, identity))
      .toMatchObject({ text: '[不支持的QQ消息: json]', mentions: [], attachments: [] })
  })

  it('rejects anonymous, missing, heartbeat and self messages', () => {
    const base = { post_type: 'message', message_type: 'group', self_id: 10000, group_id: 30000, message_id: 34,
      time: 1794297600, message: [{ type: 'text', data: { text: 'x' } }] }
    expect(oneBotEnvelope({ ...base, user_id: 20000, anonymous: { id: 1 } }, identity)).toBeUndefined()
    expect(oneBotEnvelope(base, identity)).toBeUndefined()
    expect(oneBotEnvelope({ post_type: 'meta_event', meta_event_type: 'heartbeat', self_id: 10000, time: 1794297600 }, identity)).toBeUndefined()
    expect(oneBotEnvelope({ ...base, user_id: 10000 }, identity)).toBeUndefined()
  })

  it('rejects another account and malformed URLs without throwing', () => {
    const event = { post_type: 'message', message_type: 'private', self_id: 99999, user_id: 20000, message_id: 35,
      time: 1794297600, message: [{ type: 'image', data: { url: 'javascript:bad' } }] }
    expect(oneBotEnvelope(event, identity)).toBeUndefined()
    expect(oneBotEnvelope({ ...event, self_id: 10000 }, identity)).toMatchObject({ text: '[不支持的QQ消息: image]', attachments: [] })
  })
})
