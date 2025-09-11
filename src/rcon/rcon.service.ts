import * as net from 'net'
import { Injectable, Logger } from '@nestjs/common'

// Configuration interface
export interface RconConfig {
  host: string
  port: number
  password: string
  connectionTimeout: number
  responseTimeout: number
}

// Response interfaces
export interface IRconResponse {
  status: 'success' | 'error'
  message: string
  details?: string
}

export interface IRconPacket {
  id: number
  type: number
  body: string
}

// Custom error types
export class RconError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: string
  ) {
    super(message)
    this.name = 'RconError'
  }
}

export class RconAuthenticationError extends RconError {
  constructor(details?: string) {
    super('RCON authentication failed', 'AUTH_FAILED', details)
    this.name = 'RconAuthenticationError'
  }
}

export class RconConnectionError extends RconError {
  constructor(details?: string) {
    super('RCON connection failed', 'CONNECTION_FAILED', details)
    this.name = 'RconConnectionError'
  }
}

export class RconTimeoutError extends RconError {
  constructor(operation: string) {
    super(`RCON ${operation} timeout`, 'TIMEOUT', `Operation: ${operation}`)
    this.name = 'RconTimeoutError'
  }
}

// RCON packet types as enum
enum RconPacketType {
  SERVER_DATA_AUTH = 3,
  SERVER_DATA_EXEC_COMMAND = 2,
  SERVER_DATA_RESPONSE_VALUE = 0,
  SERVER_DATA_AUTH_RESPONSE = 2,
}

@Injectable()
export class RconService {
  private readonly logger = new Logger(RconService.name)
  private requestId = 1

  private readonly config: RconConfig = {
    host: 'localhost',
    port: 27015,
    password: 'pieghiuCeiC8fae',
    connectionTimeout: 10000,
    responseTimeout: 5000,
  }

  constructor(config?: Partial<RconConfig>) {
    if (config) {
      this.config = { ...this.config, ...config }
    }
  }

  async executeCommand(command: string): Promise<IRconResponse> {
    this.logger.log(`Executing RCON command: ${command}`)

    try {
      const result = await this.executeRconCommand(command)

      this.logger.log(`RCON command successful: ${result}`)

      return {
        status: 'success',
        message: 'RCON command executed successfully',
        details: result || 'Command completed',
      }
    } catch (error) {
      this.logger.error(`RCON execution failed: ${error.message}`, error.stack)

      return {
        status: 'error',
        message:
          error instanceof RconError ? error.message : 'RCON execution error',
        details: error instanceof RconError ? error.details : error.message,
      }
    }
  }

  private async executeRconCommand(command: string): Promise<string> {
    const connection = await this.createConnection()

    try {
      await this.authenticate(connection)
      return await this.sendCommand(connection, command)
    } finally {
      this.closeConnection(connection)
    }
  }

  private async createConnection(): Promise<net.Socket> {
    const socket = new net.Socket()

    try {
      await this.connectSocket(socket)
      return socket
    } catch (error) {
      socket.destroy()
      throw new RconConnectionError(error.message)
    }
  }

  private connectSocket(socket: net.Socket): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.destroy()
        reject(new RconTimeoutError('connection'))
      }, this.config.connectionTimeout)

      const cleanup = () => {
        clearTimeout(timeout)
        socket.removeAllListeners('connect')
        socket.removeAllListeners('error')
      }

      socket.once('connect', () => {
        cleanup()
        resolve()
      })

      socket.once('error', (error) => {
        cleanup()
        reject(error)
      })

      socket.connect(this.config.port, this.config.host)
    })
  }

  private async authenticate(socket: net.Socket): Promise<void> {
    try {
      const response = await this.sendPacket(
        socket,
        RconPacketType.SERVER_DATA_AUTH,
        this.config.password
      )

      if (!response || response.id === -1) {
        throw new RconAuthenticationError(
          'Authentication rejected - check RCON password and server configuration'
        )
      }
    } catch (error) {
      if (error instanceof RconError) {
        throw error
      }
      throw new RconAuthenticationError(error.message)
    }
  }

  private async sendCommand(
    socket: net.Socket,
    command: string
  ): Promise<string> {
    const response = await this.sendPacket(
      socket,
      RconPacketType.SERVER_DATA_EXEC_COMMAND,
      command
    )

    return response?.body ?? ''
  }

  private sendPacket(
    socket: net.Socket,
    type: RconPacketType,
    body: string
  ): Promise<IRconPacket> {
    return new Promise((resolve, reject) => {
      const packetId = this.getNextRequestId()
      const packet = this.buildPacket(packetId, type, body)

      // Setup response handling
      const responseHandler = new RconResponseHandler(
        socket,
        this.config.responseTimeout,
        resolve,
        reject
      )

      responseHandler.start()

      // Send the packet
      socket.write(packet)
    })
  }

  private buildPacket(id: number, type: RconPacketType, body: string): Buffer {
    const bodyBuffer = Buffer.from(`${body}\0\0`, 'utf8')
    const packetSize = bodyBuffer.length + 10 // 4 bytes for ID + 4 bytes for type + 2 null terminators
    const packet = Buffer.alloc(packetSize + 4) // +4 for size field

    let offset = 0

    // Write packet size (little-endian)
    packet.writeInt32LE(packetSize, offset)
    offset += 4

    // Write packet ID (little-endian)
    packet.writeInt32LE(id, offset)
    offset += 4

    // Write packet type (little-endian)
    packet.writeInt32LE(type, offset)
    offset += 4

    // Write body
    bodyBuffer.copy(packet, offset)

    return packet
  }

  private getNextRequestId(): number {
    const id = this.requestId++
    if (this.requestId > 2147483647) {
      // Max positive int32
      this.requestId = 1
    }
    return id
  }

  private closeConnection(socket: net.Socket): void {
    try {
      if (!socket.destroyed) {
        socket.destroy()
      }
    } catch (error) {
      this.logger.warn(`Error closing socket: ${error.message}`)
    }
  }
}

class RconResponseHandler {
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
