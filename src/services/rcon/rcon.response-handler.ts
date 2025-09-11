import * as net from 'net'
import { RconError, RconTimeoutError } from './rcon.errors'
import { IRconPacket } from './rcon.types'

export class RconResponseHandler {
  private responseBuffer = Buffer.alloc(0)
  private expectedSize = 0
  private timeout: NodeJS.Timeout

  constructor(
    private readonly socket: net.Socket,
    private readonly timeoutMs: number,
    private readonly resolve: (packet: IRconPacket) => void,
    private readonly reject: (error: Error) => void
  ) {}

  start(): void {
    this.timeout = setTimeout(() => {
      this.cleanup()
      this.reject(new RconTimeoutError('response'))
    }, this.timeoutMs)

    this.socket.on('data', this.handleData)
    this.socket.once('error', this.handleError)
  }

  private readonly handleData = (data: Buffer): void => {
    this.responseBuffer = Buffer.concat([this.responseBuffer, data])

    // Read expected size from first 4 bytes
    if (this.expectedSize === 0 && this.responseBuffer.length >= 4) {
      this.expectedSize = this.responseBuffer.readInt32LE(0) + 4
    }

    // Check if we have complete response
    if (
      this.expectedSize > 0 &&
      this.responseBuffer.length >= this.expectedSize
    ) {
      try {
        const packet = this.parsePacket()
        this.cleanup()
        this.resolve(packet)
      } catch (error) {
        this.cleanup()
        this.reject(
          new RconError(
            'Failed to parse response',
            'PARSE_ERROR',
            error.message
          )
        )
      }
    }
  }

  private readonly handleError = (error: Error): void => {
    this.cleanup()
    this.reject(error)
  }

  private parsePacket(): IRconPacket {
    if (this.responseBuffer.length < 12) {
      throw new Error('Response too short')
    }

    const id = this.responseBuffer.readInt32LE(4)
    const type = this.responseBuffer.readInt32LE(8)
    const body = this.responseBuffer
      .subarray(12, this.expectedSize - 2)
      .toString('utf8')

    return { id, type, body }
  }

  private cleanup(): void {
    if (this.timeout) {
      clearTimeout(this.timeout)
    }
    this.socket.removeListener('data', this.handleData)
    this.socket.removeListener('error', this.handleError)
  }
}
