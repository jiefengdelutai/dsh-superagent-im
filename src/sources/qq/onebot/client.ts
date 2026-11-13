/** Small authenticated OneBot v11 HTTP action client. */
export type OneBotFetch = (input: string, init?: RequestInit) => Promise<Response>

/** Structured OneBot action failure used for retry classification. */
export class OneBotError extends Error {
  constructor(message: string, readonly retcode?: number, readonly status?: number) { super(message) }
}

interface Options { endpoint: string; token: string; timeoutMs?: number; fetcher?: OneBotFetch }

/** Authenticated, bounded HTTP client for OneBot v11 actions. */
export class OneBotClient {
  private readonly endpoint: string
  private readonly fetcher: OneBotFetch
  constructor(private readonly options: Options) {
    this.endpoint = options.endpoint.replace(/\/+$/, '')
    this.fetcher = options.fetcher ?? fetch
  }

  async call(action: string, params: Record<string, unknown>): Promise<unknown> {
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? 10_000)
    try {
      const result = await this.fetcher(`${this.endpoint}/${action}`, { method: 'POST', signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.options.token}` }, body: JSON.stringify(params) })
      const body = await result.json() as { status?: unknown; retcode?: unknown; message?: unknown; wording?: unknown; data?: unknown }
      const retcode = typeof body.retcode === 'number' ? body.retcode : undefined
      if (!result.ok || body.status !== 'ok' || retcode !== 0) {
        const detail = typeof body.message === 'string' ? body.message : typeof body.wording === 'string' ? body.wording : `OneBot action failed (${result.status})`
        throw new OneBotError(this.redact(detail), retcode, result.status)
      }
      return body.data
    } catch (error) {
      if (error instanceof OneBotError) throw error
      const detail = error instanceof Error ? error.message : String(error)
      throw new OneBotError(this.redact(detail))
    }
  }

  private redact(value: string): string { return this.options.token ? value.replaceAll(this.options.token, '[redacted]') : value }
}
