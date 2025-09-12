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
    if (this.isConnected && this.rconClient) return

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
  }

  async disconnect(): Promise<void> {
    if (this.rconClient && this.isConnected) {
      try {
        await this.rconClient.end()
        this.isConnected = false
        this.logger.log('Disconnected from Factorio RCON server')
      } catch (error) {
        this.logger.error(
          `Error disconnecting: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
    this.rconClient = undefined
  }

  async executeCommand(command: string): Promise<string> {
    await this.ensureConnected()

    if (!this.rconClient) {
      throw new Error('RCON client is not initialized')
    }

    return this.rconClient.send(command)
  }

  getServerTime(): Promise<string> {
    return this.executeCommand('/time')
  }

  async listSaves(): Promise<{ name: string; size: number; modified: Date }[]> {
    const savesDir = '/factorio/saves'
    const files = await fs.readdir(savesDir)
    const saveFiles = files.filter((file) => file.endsWith('.zip'))

    const saveInfo = await Promise.all(
      saveFiles.map(async (file) => {
        const filePath = join(savesDir, file)
        const stat = await fs.stat(filePath)
        return {
          name: file.replace('.zip', ''),
          size: stat.size,
          modified: stat.mtime,
        }
      })
    )

    return saveInfo.sort(
      (saveA, saveB) => saveB.modified.getTime() - saveA.modified.getTime()
    )
  }

  async loadSave(saveName: string): Promise<string> {
    const saves = await this.listSaves()
    if (!saves.some((save) => save.name === saveName)) {
      throw new Error(`Save file '${saveName}' not found`)
    }

    this.logger.log(`Loading save: ${saveName}`)
    await this.restartServerWithSave(saveName)
    return `Server restarted and loaded save: ${saveName}`
  }

  async uploadAndLoadSave(
    fileBuffer: Buffer,
    originalName: string,
    autoLoad = false
  ): Promise<{
    message: string
    fileName: string
    loadResult?: string
  }> {
    if (!originalName.toLowerCase().endsWith('.zip')) {
      throw new Error('Save file must be a .zip file')
    }

    const finalName = 'default.zip'
    const safeName = 'default'

    if (autoLoad) {
      await this.stopServer()
    }

    // Upload file
    const savesDir = '/factorio/saves'
    const targetPath = join(savesDir, finalName)
    await fs.mkdir(savesDir, { recursive: true })
    await fs.writeFile(targetPath, fileBuffer)
    this.logger.log(`Uploaded save file: ${targetPath}`)

    let loadResult: string | undefined

    if (autoLoad) {
      await this.startServerWithSave(safeName)
      loadResult = `Server restarted and loaded save: ${safeName}`
      this.logger.log(loadResult)
    }

    return {
      message: `Save file uploaded successfully${autoLoad ? ' and loaded' : ''}`,
      fileName: finalName,
      loadResult,
    }
  }

  private async restartServerWithSave(saveName: string): Promise<void> {
    await this.stopServer()
    await this.startServerWithSave(saveName)
  }

  private async stopServer(): Promise<void> {
    await this.disconnect()

    try {
      // Check if running on ARM architecture
      await execAsync('pkill -f "factorio.*--port.*34197"')
      this.logger.log('Factorio process stopped')
    } catch {
      // Process not running, that's fine
    }

    await this.delay(5000) // Wait for clean shutdown

    try {
      // Check if running on ARM architecture
      await execAsync('rm -f /opt/factorio/.lock')
    } catch {
      // No lock files to clean
    }
  }

  private async startServerWithSave(saveName: string): Promise<void> {
    const factorioExecutable = await this.getFactorioExecutable()

    const command = `${factorioExecutable} \\
      --port ${process.env.FACTORIO_PORT || '34197'} \\
      --server-settings /factorio/config/server-settings.json \\
      --rcon-port ${process.env.FACTORIO_RCON_PORT || '27015'} \\
      --rcon-password "${process.env.FACTORIO_RCON_PASSWORD || 'factorio'}" \\
      --server-id /factorio/config/server-id.json \\
      --mod-directory /factorio/mods \\
      --start-server "${saveName}"`

    // Check if running on ARM architecture
    await execAsync(`${command} > /tmp/factorio-restart.log 2>&1 &`)
    await this.delay(2000)

    await this.waitForServerReady()
    await this.connect()
  }

  private async waitForServerReady(): Promise<void> {
    await this.waitForServerReadyRecursive(0, 30, 2000)
  }

  private async waitForServerReadyRecursive(
    attempts: number,
    maxAttempts: number,
    delayMs: number
  ): Promise<void> {
    const isReady = await this.testConnection()

    if (isReady) {
      this.logger.log('Factorio server is ready!')
      return
    }

    if (attempts >= maxAttempts - 1) {
      throw new Error(
        `Timeout waiting for Factorio server to be ready after ${(maxAttempts * delayMs) / 1000} seconds`
      )
    }

    await this.delay(delayMs)
    return this.waitForServerReadyRecursive(attempts + 1, maxAttempts, delayMs)
  }

  private async testConnection(): Promise<boolean> {
    try {
      const testConnection = new Rcon({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        timeout: 3000,
      })

      await testConnection.connect()
      await testConnection.end()
      return true
    } catch {
      return false
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.isConnected && this.rconClient) return

    await this.ensureConnectedRecursive(0)
  }

  private async ensureConnectedRecursive(attempts: number): Promise<void> {
    try {
      await this.connect()
    } catch (error) {
      if (attempts >= this.config.maxRetries - 1) throw error

      this.logger.warn(`Connection attempt ${attempts + 1} failed, retrying...`)
      await this.delay(1000 * (attempts + 1))
      return this.ensureConnectedRecursive(attempts + 1)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async getFactorioExecutable(): Promise<string> {
    try {
      // Check if running on ARM architecture
      await execAsync('which box64')
      return '/bin/box64 /opt/factorio/bin/x64/factorio'
    } catch {
      return '/opt/factorio/bin/x64/factorio'
    }
  }
}
