import { describe, expect, it } from 'vitest'
import { qqText, type QqContentPart, type QqEnvelope } from '../src/sources/qq/envelope.ts'

describe('QQ envelope', () => {
  it('keeps transport-specific identities distinct', () => {
    const official: QqEnvelope = { transport: 'official', instanceId: 'app-1', messageId: 'm1', conversation: { kind: 'direct', id: '42' },
      sender: { id: '42', human: true }, at: '2026-11-10T08:00:00.000Z', text: 'hello', mentions: [], attachments: [] }
    const onebot: QqEnvelope = { ...official, transport: 'onebot', instanceId: '10001' }
    expect([official.transport, official.instanceId]).toEqual(['official', 'app-1'])
    expect([onebot.transport, onebot.instanceId]).toEqual(['onebot', '10001'])
  })

  it('renders unsupported content safely without turning it into a mention', () => {
    const parts: QqContentPart[] = [
      { type: 'text', text: '看这个 ' },
      { type: 'unsupported', nativeType: 'mystery-card' },
      { type: 'mention', id: '' },
    ]
    expect(qqText(parts)).toEqual({ text: '看这个 [不支持的QQ消息: mystery-card]', mentions: [] })
  })

  it('extracts valid mentions and attachment summaries', () => {
    const parts: QqContentPart[] = [
      { type: 'mention', id: 'bot-open-id', name: '助手' },
      { type: 'attachment', attachment: { type: 'image', id: 'image-1', name: '截图.png' } },
    ]
    expect(qqText(parts)).toEqual({ text: '@助手 [图片: 截图.png]', mentions: ['bot-open-id'] })
  })
})
