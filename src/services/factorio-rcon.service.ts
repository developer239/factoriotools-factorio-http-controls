import { promises as fs } from 'fs'
import { join } from 'path'
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Rcon } from 'rcon-client'
import { FactorioConfig } from '../config/factorio.config'

@Injectable()
export class FactorioRconService implements OnModuleDestroy {
  private readonly logger = new Logger(FactorioRconService.name)
  private rconClient?: Rcon
  private isConnected = false
  private readonly config: FactorioConfig['rcon']

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<FactorioConfig>('factorio')!.rcon
  }

  async onModuleDestroy() {
    await this.disconnect()
  }

  async connect(): Promise<void> {
    if (this.isConnected && this.rconClient) {
      this.logger.debug('Already connected to RCON server')
      return
    }

    try {
      this.rconClient = new Rcon({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        timeout: this.config.timeout,
      })

      await this.rconClient.connect()
      this.isConnected = true
      this.logger.log(
        `Connected to Factorio RCON server at ${this.config.host}:${this.config.port}`
      )
    } catch (error) {
      this.isConnected = false
      this.logger.error(
        `Failed to connect to RCON server: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.rconClient && this.isConnected) {
      try {
        await this.rconClient.end()
        this.isConnected = false
        this.logger.log('Disconnected from Factorio RCON server')
      } catch (error) {
        this.logger.error(
          `Error disconnecting from RCON server: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
    this.rconClient = undefined
  }

  async executeCommand(command: string): Promise<string> {
    await this.ensureConnected()

    try {
      const response = await this.rconClient!.send(command)
      this.logger.debug(`Executed command: ${command}, Response: ${response}`)
      return response
    } catch (error) {
      const errorMessage = `Failed to execute command '${command}': ${error instanceof Error ? error.message : String(error)}`
      this.logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }

  getServerTime(): Promise<string> {
    return this.executeCommand('/time')
  }

  async listSaves(): Promise<
    { name: string; size: number; modified: Date }[]
  > {
    try {
      const savesDir = '/factorio/saves'
      const files = await fs.readdir(savesDir)

      // Filter .zip save files and get their stats
      const saveFiles = files.filter((file) => file.endsWith('.zip'))

      const saveInfo = await Promise.all(
        saveFiles.map(async (file) => {
          const filePath = join(savesDir, file)
          const stat = await fs.stat(filePath)
          return {
            name: file.replace('.zip', ''), // Remove .zip extension for display
            size: stat.size,
            modified: stat.mtime,
          }
        })
      )

      // Sort by modification time (newest first)
      return saveInfo.sort(
        (saveA, saveB) => saveB.modified.getTime() - saveA.modified.getTime()
      )
    } catch (error) {
      throw new Error(
        `Failed to list save files: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.isConnected && this.rconClient) {
      return
    }

    await this.retryConnection(0)
  }

  private async retryConnection(attempts: number): Promise<void> {
    try {
      await this.connect()
    } catch (error) {
      const nextAttempts = attempts + 1

      if (nextAttempts >= this.config.maxRetries) {
        throw error
      }

      this.logger.warn(`Connection attempt ${nextAttempts} failed, retrying...`)

      await this.delay(1000 * nextAttempts)
      await this.retryConnection(nextAttempts)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }
}
