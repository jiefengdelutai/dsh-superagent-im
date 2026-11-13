import { describe, expect, it } from 'vitest'
import { SettingsSchema, settingsPolicy } from '../src/policy.ts'
import type { Thread, Trigger } from '../src/core/index.ts'
import { SourceRegistry } from '../src/sources/registry.ts'
import { officialQqKind, oneBotQqKind } from '../src/sources/qq/kind.ts'

describe('QQ source kinds', () => {
  it('keeps official OpenIDs and personal QQ numbers in separate schemas', () => {
    expect(officialQqKind.schema.parse({ appId: 'app-1', appSecret: 's', botOpenId: 'bot-openid' })).toMatchObject({ appId: 'app-1' })
    expect(oneBotQqKind.schema.parse({ accountId: '10001', token: 't' })).toMatchObject({ accountId: '10001' })
    expect(() => oneBotQqKind.schema.parse({ accountId: 'openid-user', token: 't' })).toThrow()
    expect(officialQqKind.fields.find(field => field.key === 'appSecret')?.type).toBe('secret')
    expect(oneBotQqKind.fields.find(field => field.key === 'token')?.type).toBe('secret')
  })

  it('applies private, group allowlist, mention and disabled-instance scope rules', () => {
    const settings = SettingsSchema.parse({ sources: {
      'qq-official': { enabled: true, config: { appId: 'app', appSecret: 's', botOpenId: 'bot', directMessages: false,
        groups: [{ id: 'g-all', listen: 'all' }, { id: 'g-at', listen: 'mentions' }], otherGroups: 'mentions' } },
      'qq-onebot': { enabled: false, config: { accountId: '10001', token: 't' } },
    } })
    const sources = new SourceRegistry(() => settings); sources.register(officialQqKind); sources.register(oneBotQqKind)
    const scope = (conversationType: string, conversationId: string) => sources.scope({ source: 'qq-official', meta: { conversationType, conversationId } })
    expect(scope('direct', 'u')).toEqual({ listened: false, reason: 'direct_messages_not_allowed' })
    expect(scope('group', 'g-all')).toEqual({ listened: true, observed: true, row: 'g-all' })
    expect(scope('group', 'g-at')).toEqual({ listened: true, observed: false, row: 'g-at' })
    expect(scope('group', 'other')).toEqual({ listened: true, observed: false, row: 'other' })
    expect(sources.scope({ source: 'qq-onebot', meta: { conversationType: 'direct', conversationId: '2' } }))
      .toEqual({ listened: false, reason: 'source_disabled' })
  })

  it('uses transport-specific sender policy IDs and exposes no secrets as environment values', () => {
    const official = officialQqKind.policy!.schema.parse({ allowed: [{ id: 'app-1:user-openid' }] })
    const onebot = oneBotQqKind.policy!.schema.parse({ allowed: [{ id: '10001:20002' }] })
    expect(official.allowed[0]?.id).toBe('app-1:user-openid')
    expect(onebot.allowed[0]?.id).toBe('10001:20002')
    expect(() => oneBotQqKind.policy!.schema.parse({ allowed: [{ id: 'app-1:user-openid' }] })).toThrow()
    expect(officialQqKind.environment).toBeUndefined()
    expect(oneBotQqKind.environment).toBeUndefined()
  })

  it('allows replies only to the configured account and conversations still being received', () => {
    const official = officialQqKind.schema.parse({ appId: 'app-1', appSecret: 's', botOpenId: 'bot', groups: [{ id: 'g1', listen: 'all' }] })
    expect(officialQqKind.channel!.allowed!({ instanceId: 'app-1', conversationType: 'group', conversationId: 'g1' }, official)).toBe(true)
    expect(officialQqKind.channel!.allowed!({ instanceId: 'other', conversationType: 'group', conversationId: 'g1' }, official)).toBe(false)
    expect(JSON.stringify({ instanceId: 'app-1', conversationType: 'group', conversationId: 'g1' })).not.toMatch(/secret|token/i)
  })

  it('requires a transport-specific allowed sender and addressing for an explicit request', () => {
    const settings = SettingsSchema.parse({
      sources: { 'qq-onebot': { enabled: true, config: { accountId: '10001', token: 't', groups: [{ id: '30003', listen: 'mentions' }] } } },
      policy: { sources: { 'qq-onebot': { allowed: [{ id: '10001:20002', name: 'Alice' }] } } },
    })
    const sources = new SourceRegistry(() => settings); sources.register(oneBotQqKind)
    const policy = settingsPolicy(settings, sources)
    const thread = { key: 'qq-onebot:group', ref: { source: 'qq-onebot', id: 'group' }, createdAt: '', subscriptions: [], correlated: [], pending: [], meta: {} } as Thread
    const trigger = { id: 'm1', source: 'qq-onebot', threads: [thread.ref], actor: { source: 'qq-onebot', id: '10001:20002' },
      human: true, addressed: 'mention', at: '', text: '执行', meta: { conversationType: 'group', conversationId: '30003' } } as Trigger
    expect(policy.gate(trigger, thread, [])).toMatchObject({ admissible: true, strength: 'explicit', basis: { sender: 'Alice', via: 'addressed' } })
    expect(policy.gate({ ...trigger, actor: { source: 'qq-onebot', id: '10001:99999' } }, thread, [])).toEqual({ admissible: false, reason: 'not_a_member' })
    const { addressed: _addressed, ...unaddressed } = trigger
    expect(policy.gate(unaddressed, thread, [])).toEqual({ admissible: false, reason: 'no_mention' })
  })
})
