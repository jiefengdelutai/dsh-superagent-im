import { describe, expect, it } from 'vitest'
import { officialEnvelope, officialSdkEvent } from '../src/sources/qq/official/protocol.ts'

describe('official QQ protocol', () => {
  it('recognizes the platform @bot event without a structured mentions list', () => {
    const message = { kind: 'group' as const, rawEventType: 'GROUP_AT_MESSAGE_CREATE', senderId: 'member-1',
      content: '检查项目', messageId: 'm-at', timestamp: '2026-11-10T08:00:00Z',
      replyTarget: { scope: 'group' as const, targetId: 'group-1', msgId: 'm-at' } }
    expect(officialSdkEvent(message, 'bot-openid')?.mentions).toEqual([{ id: 'bot-openid' }])
    expect(officialSdkEvent({ ...message, rawEventType: 'GROUP_MESSAGE_CREATE' }, 'bot-openid')?.mentions).toEqual([])
  })
  it('normalizes a private message', () => {
    expect(officialEnvelope({ id: 'm1', scene: 'c2c', targetId: 'user-openid', author: { id: 'user-openid' },
      content: '你好', timestamp: '2026-11-10T08:00:00Z' }, { instanceId: 'app-1', selfId: 'bot-openid' })).toEqual({
      transport: 'official', instanceId: 'app-1', messageId: 'm1', conversation: { kind: 'direct', id: 'user-openid' },
      sender: { id: 'user-openid', human: true }, at: '2026-11-10T08:00:00.000Z', text: '你好', mentions: [], attachments: [],
    })
  })

  it('normalizes group mentions, replies and media summaries', () => {
    expect(officialEnvelope({ id: 'm2', scene: 'group', targetId: 'group-openid', author: { id: 'member-openid' }, content: '看一下',
      timestamp: 1794297600000, mentions: [{ id: 'bot-openid', name: '助手' }], replyTo: 'parent-1', rootId: 'root-1',
      attachments: [{ type: 'image', id: 'img-1', name: '错误截图.png', url: 'https://example.test/image' }] },
    { instanceId: 'app-1', selfId: 'bot-openid' })).toEqual({
      transport: 'official', instanceId: 'app-1', messageId: 'm2', conversation: { kind: 'group', id: 'group-openid' },
      sender: { id: 'member-openid', human: true }, at: '2026-11-10T08:00:00.000Z',
      text: '看一下 @助手 [图片: 错误截图.png]', mentions: ['bot-openid'], replyTo: 'parent-1', rootId: 'root-1',
      attachments: [{ type: 'image', id: 'img-1', name: '错误截图.png', url: 'https://example.test/image' }],
    })
  })

  it('drops self events and unknown event shapes', () => {
    expect(officialEnvelope({ id: 'm3', scene: 'group', targetId: 'g1', author: { id: 'bot-openid', bot: true }, content: 'echo',
      timestamp: '2026-11-10T08:00:00Z' }, { instanceId: 'app-1', selfId: 'bot-openid' })).toBeUndefined()
    expect(officialEnvelope({ id: 'm4', scene: 'guild', targetId: 'channel-1', author: { id: 'u1' }, content: 'hello',
      timestamp: '2026-11-10T08:00:00Z' }, { instanceId: 'app-1', selfId: 'bot-openid' })).toBeUndefined()
    expect(officialEnvelope({ type: 'ready' }, { instanceId: 'app-1', selfId: 'bot-openid' })).toBeUndefined()
  })

  it('does not turn malformed mentions or attachments into addressed content', () => {
    expect(officialEnvelope({ id: 'm5', scene: 'group', targetId: 'g1', author: { id: 'u1' }, content: 'hello',
      timestamp: '2026-11-10T08:00:00Z', mentions: [{ id: '' }, { nope: true }], attachments: [{ type: 'mystery' }] },
    { instanceId: 'app-1', selfId: 'bot-openid' })).toMatchObject({ text: 'hello [不支持的QQ消息: attachment:mystery]', mentions: [], attachments: [] })
  })

  it('adapts the Tencent SDK inbound shape at one explicit boundary', () => {
    expect(officialSdkEvent({ kind: 'group', rawEventType: 'GROUP_AT_MESSAGE_CREATE', senderId: 'member-1', senderIsBot: false, content: '查一下', messageId: 'm6',
      timestamp: '2026-11-10T08:00:00Z', replyTarget: { scope: 'group', targetId: 'group-1', msgId: 'm6' },
      mentions: [{ member_openid: 'bot-native-id', nickname: '助手', is_you: true }],
      attachments: [{ content_type: 'image/png', url: 'https://example.test/a.png', filename: 'a.png' }] }, 'bot-openid')).toEqual({
      id: 'm6', scene: 'group', targetId: 'group-1', author: { id: 'member-1', bot: false }, content: '查一下',
      timestamp: '2026-11-10T08:00:00Z', mentions: [{ id: 'bot-openid', name: '助手' }],
      attachments: [{ type: 'image', url: 'https://example.test/a.png', name: 'a.png' }],
    })
  })
})
