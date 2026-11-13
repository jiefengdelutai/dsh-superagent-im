/** Maps transport-neutral QQ envelopes onto the task engine's source domain. */
import { key, threadKey, type ThreadRef, type Trigger } from '../../core/index.ts'
import type { QqEnvelope, QqIdentity, QqTransport } from './envelope.ts'

export const qqSource = (transport: QqTransport): 'qq-official' | 'qq-onebot' => transport === 'official' ? 'qq-official' : 'qq-onebot'

export function qqThread(envelope: QqEnvelope): ThreadRef {
  const source = qqSource(envelope.transport)
  const { instanceId, conversation } = envelope
  if (conversation.kind === 'direct') return { source, id: `${instanceId}:direct:${conversation.id}` }
  const replyRoot = envelope.rootId || envelope.replyTo
  return { source, id: `${instanceId}:group:${conversation.id}${replyRoot ? `:${replyRoot}` : ''}` }
}

/** Returns no Trigger for the connected account's own messages, preventing reply loops. */
export function qqTrigger(envelope: QqEnvelope, self: QqIdentity): Trigger | undefined {
  if (envelope.sender.id === self.actorId) return
  const source = qqSource(envelope.transport)
  const thread = qqThread(envelope)
  const direct = envelope.conversation.kind === 'direct'
  const mentioned = envelope.mentions.includes(self.actorId)
  const address = { instanceId: envelope.instanceId, conversationType: envelope.conversation.kind,
    conversationId: envelope.conversation.id, messageId: envelope.messageId }
  return {
    id: key(source, envelope.instanceId, envelope.messageId), source, threads: [thread],
    actor: { source, id: `${envelope.instanceId}:${envelope.sender.id}` }, human: envelope.sender.human,
    ...(direct ? { addressed: 'direct' as const } : mentioned ? { addressed: 'mention' as const } : {}),
    at: envelope.at, text: envelope.text,
    channel: { source, thread: threadKey(thread), address },
    ...(envelope.url ? { url: envelope.url } : {}),
    meta: { transport: envelope.transport, instanceId: envelope.instanceId, messageId: envelope.messageId,
      conversationType: envelope.conversation.kind, conversationId: envelope.conversation.id,
      ...(envelope.replyTo ? { replyTo: envelope.replyTo } : {}), ...(envelope.rootId ? { rootId: envelope.rootId } : {}),
      ...(envelope.attachments.length ? { attachments: envelope.attachments } : {}) },
  }
}
