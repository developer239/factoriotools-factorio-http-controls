import { exec } from 'child_process'
import { promises as fs } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Rcon } from 'rcon-client'
import { FactorioConfig } from '../config/factorio.config'

const execAsync = promisify(exec)

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

  async listSaves(): Promise<{ name: string; size: number; modified: Date }[]> {
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

  async loadSave(saveName: string): Promise<string> {
    // Validate save exists first
    const saves = await this.listSaves()
    const isSaveFound = saves.some((save) => save.name === saveName)

    if (!isSaveFound) {
      throw new Error(`Save file '${saveName}' not found`)
    }

    this.logger.log(`Starting load process for save: ${saveName}`)

    try {
      // 1. Disconnect RCON before stopping server
      await this.disconnect()

      // 2. Kill the Factorio server process (if running)
      // Fixed: Use correct process pattern that matches actual running process
      this.logger.log('Stopping Factorio server (if running)...')
      try {
        await execAsync('pkill -f "factorio.*--port.*34197"')
        this.logger.log('Factorio process stopped')
      } catch (error) {
        this.logger.log('No Factorio process found to stop (this is ok)')
      }

      // Wait longer for clean shutdown and lock file cleanup
      this.logger.log('Waiting for lock file cleanup...')
      await this.delay(5000) // Increased from 2000ms to 5000ms

      // 3. Clean up any remaining lock files (safety measure)
      try {
        await execAsync('rm -f /opt/factorio/.lock')
        this.logger.debug('Cleaned up any remaining lock files')
      } catch (error) {
        this.logger.debug('No lock files to clean (this is ok)')
      }

      // 4. Restart Factorio server with the selected save
      // Fixed: Use Box64 emulation wrapper for x64 binary on ARM
      this.logger.log(`Restarting Factorio server with save: ${saveName}`)
      const restartCommand = `/bin/box64 /opt/factorio/bin/x64/factorio \\
        --port ${process.env.FACTORIO_PORT || '34197'} \\
        --server-settings /factorio/config/server-settings.json \\
        --rcon-port ${process.env.FACTORIO_RCON_PORT || '27015'} \\
        --rcon-password "${process.env.FACTORIO_RCON_PASSWORD || 'factorio'}" \\
        --server-id /factorio/config/server-id.json \\
        --mod-directory /factorio/mods \\
        --start-server "${saveName}"`

      // Execute without background mode to capture errors properly
      this.logger.debug(`Executing: ${restartCommand}`)
      
      // Start the process in background but with proper error handling
      const childProcess = execAsync(`${restartCommand} > /tmp/factorio-restart.log 2>&1 &`)
      
      // Don't wait for the command to finish since it runs indefinitely
      // Just give it a moment to start
      await this.delay(2000)

      // 5. Wait for server to be ready and reconnect RCON
      this.logger.log('Waiting for Factorio server to be ready...')
      await this.waitForServerReady()
      await this.connect()

      this.logger.log(`Successfully loaded save: ${saveName}`)
      return `Server restarted and loaded save: ${saveName}`
    } catch (error) {
      const errorMessage = `Failed to load save '${saveName}': ${error instanceof Error ? error.message : String(error)}`
      this.logger.error(errorMessage)
      
      // If restart failed, try to reconnect to existing server
      try {
        this.logger.log('Attempting to reconnect to existing server...')
        await this.connect()
      } catch (reconnectError) {
        this.logger.error('Failed to reconnect to existing server')
      }
      
      throw new Error(errorMessage)
    }
  }

  private async waitForServerReady(): Promise<void> {
    const maxAttempts = 30 // 60 seconds total
    const delayMs = 2000

    for (let attempts = 0; attempts < maxAttempts; attempts += 1) {
      // eslint-disable-next-line no-await-in-loop
      const isReady = await this.testConnection()

      if (isReady) {
        this.logger.log('Factorio server is ready!')
        return
      }

      this.logger.debug(
        `Waiting for server... attempt ${attempts + 1}/${maxAttempts}`
      )

      if (attempts < maxAttempts - 1) {
        // eslint-disable-next-line no-await-in-loop
        await this.delay(delayMs)
      }
    }

    throw new Error(
      `Timeout waiting for Factorio server to be ready after ${(maxAttempts * delayMs) / 1000} seconds`
    )
  }

  private async testConnection(): Promise<boolean> {
    try {
      const testConnection = new Rcon({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        timeout: 3000, // Increased timeout for stability
      })

      await testConnection.connect()
      await testConnection.end()
      return true
    } catch (error) {
      this.logger.debug(
        `Connection test failed: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
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
