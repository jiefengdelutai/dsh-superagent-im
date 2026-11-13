import { describe, expect, it } from 'vitest'
import { key, threadKey } from '../src/core/index.ts'
import type { QqEnvelope, QqIdentity } from '../src/sources/qq/envelope.ts'
import { qqThread, qqTrigger } from '../src/sources/qq/mapping.ts'

const self = (transport: QqIdentity['transport'], instanceId: string, actorId: string): QqIdentity => ({ transport, instanceId, actorId })
const message = (overrides: Partial<QqEnvelope> = {}): QqEnvelope => ({
  transport: 'official', instanceId: 'app-1', messageId: 'message-1', conversation: { kind: 'group', id: 'group-1' },
  sender: { id: 'user-1', human: true }, at: '2026-11-10T08:00:00.000Z', text: 'ship it', mentions: [], attachments: [], ...overrides,
})

describe('QQ domain mapping', () => {
  it('builds stable transport-specific trigger ids', () => {
    const official = qqTrigger(message(), self('official', 'app-1', 'bot-1'))!
    const onebot = qqTrigger(message({ transport: 'onebot', instanceId: '10001' }), self('onebot', '10001', '10001'))!
    expect(official.id).toBe(key('qq-official', 'app-1', 'message-1'))
    expect(onebot.id).toBe(key('qq-onebot', '10001', 'message-1'))
    expect(onebot.id).not.toBe(official.id)
  })

  it('keeps direct conversations in one stable thread', () => {
    const first = message({ conversation: { kind: 'direct', id: 'user-1' }, messageId: 'first' })
    const second = message({ conversation: { kind: 'direct', id: 'user-1' }, messageId: 'second' })
    expect(qqThread(first)).toEqual(qqThread(second))
    expect(qqThread(first)).toEqual({ source: 'qq-official', id: 'app-1:direct:user-1' })
  })

  it('uses a reply root for a group thread and the group conversation otherwise', () => {
    expect(qqThread(message({ rootId: 'root-7', replyTo: 'parent-8' }))).toEqual({ source: 'qq-official', id: 'app-1:group:group-1:root-7' })
    expect(qqThread(message({ replyTo: 'parent-8' }))).toEqual({ source: 'qq-official', id: 'app-1:group:group-1:parent-8' })
    expect(qqThread(message())).toEqual({ source: 'qq-official', id: 'app-1:group:group-1' })
  })

  it('marks direct messages and valid mentions as addressed', () => {
    expect(qqTrigger(message({ conversation: { kind: 'direct', id: 'user-1' } }), self('official', 'app-1', 'bot-1'))?.addressed).toBe('direct')
    expect(qqTrigger(message({ mentions: ['bot-1'] }), self('official', 'app-1', 'bot-1'))?.addressed).toBe('mention')
    expect(qqTrigger(message({ mentions: ['someone-else'] }), self('official', 'app-1', 'bot-1'))?.addressed).toBeUndefined()
  })

  it('drops messages sent by the connected identity', () => {
    expect(qqTrigger(message({ sender: { id: 'bot-1', human: false } }), self('official', 'app-1', 'bot-1'))).toBeUndefined()
  })

  it('keeps credentials out of persisted trigger metadata and channel addresses', () => {
    const envelope = message({ attachments: [{ type: 'image', id: 'image-1', name: '截图.png' }] })
    const trigger = qqTrigger(envelope, self('official', 'app-1', 'bot-1'))!
    expect(trigger.actor).toEqual({ source: 'qq-official', id: 'app-1:user-1' })
    expect(trigger.meta).toEqual({ transport: 'official', instanceId: 'app-1', messageId: 'message-1', conversationType: 'group',
      conversationId: 'group-1', attachments: [{ type: 'image', id: 'image-1', name: '截图.png' }] })
    expect(trigger.channel).toEqual({ source: 'qq-official', thread: threadKey(trigger.threads[0]!), address: {
      instanceId: 'app-1', conversationType: 'group', conversationId: 'group-1', messageId: 'message-1' } })
    expect(JSON.stringify(trigger)).not.toMatch(/secret|token/i)
  })
})
