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
