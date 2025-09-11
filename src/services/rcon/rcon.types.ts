export interface IRconConfig {
  host: string
  port: number
  password: string
  connectionTimeout: number
  responseTimeout: number
}

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

export enum RconPacketType {
  SERVER_DATA_AUTH = 3,
  SERVER_DATA_EXEC_COMMAND = 2,
  SERVER_DATA_RESPONSE_VALUE = 0,
  SERVER_DATA_AUTH_RESPONSE = 2,
}
