declare module 'ws' {
  import type { IncomingMessage } from 'node:http'
  import type { EventEmitter } from 'node:events'

  export type RawData = Buffer | ArrayBuffer | Buffer[]
  /** Minimal connected WebSocket surface consumed by the runtime adapter. */
  export class WebSocket extends EventEmitter {
    close(code?: number, reason?: string): void
    on(event: 'message', listener: (data: RawData, isBinary: boolean) => void): this
    on(event: 'close', listener: () => void): this
  }
  /** Minimal WebSocket server surface consumed by the runtime adapter. */
  export class WebSocketServer extends EventEmitter {
    constructor(options: { host?: string; port: number; path?: string })
    readonly clients: Set<WebSocket>
    on(event: 'connection', listener: (socket: WebSocket, request: IncomingMessage) => void): this
    close(callback: (error?: Error) => void): void
  }
}
