import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { FactorioRconService } from '../services/factorio-rcon.service'

@Controller('factorio')
export class FactorioController {
  private readonly logger = new Logger(FactorioController.name)

  constructor(private readonly factorioRconService: FactorioRconService) {}

  private handleError(operation: string, error: unknown): never {
    const message = error instanceof Error ? error.message : String(error)
    this.logger.error(`${operation}: ${message}`)
    throw new HttpException(operation, HttpStatus.INTERNAL_SERVER_ERROR)
  }

  @Get('time')
  async getServerTime(): Promise<{ time: string }> {
    try {
      const time = await this.factorioRconService.getServerTime()
      return { time }
    } catch (error) {
      this.handleError('Failed to get server time', error)
    }
  }

  @Post('speed/slow')
  setSlowSpeed(): Promise<{ message: string; speed: string }> {
    return this.setSpeed('slow')
  }

  @Post('speed/normal')
  setNormalSpeed(): Promise<{ message: string; speed: string }> {
    return this.setSpeed('normal')
  }

  @Post('speed/fast')
  setFastSpeed(): Promise<{ message: string; speed: string }> {
    return this.setSpeed('fast')
  }

  @Post('pause')
  async pauseGame(): Promise<{ message: string }> {
    try {
      await this.factorioRconService.executeCommand('/pause')
      return { message: 'Game paused' }
    } catch (error) {
      this.handleError('Failed to pause game', error)
    }
  }

  @Post('unpause')
  async unpauseGame(): Promise<{ message: string }> {
    try {
      await this.factorioRconService.executeCommand('/unpause')
      return { message: 'Game unpaused' }
    } catch (error) {
      this.handleError('Failed to unpause game', error)
    }
  }

  @Get('status')
  async getServerStatus(): Promise<{ status: string }> {
    try {
      const status = await this.factorioRconService.executeCommand('/players')
      return { status }
    } catch (error) {
      this.handleError('Failed to get server status', error)
    }
  }

  @Post('save')
  async triggerSave(): Promise<{ message: string; result: string }> {
    try {
      const result = await this.factorioRconService.executeCommand('/save')
      return {
        message: 'Save triggered successfully',
        result: result.trim(),
      }
    } catch (error) {
      this.handleError('Failed to trigger save', error)
    }
  }

  @Get('saves')
  async listSaves(): Promise<{
    message: string
    saves: { name: string; size: number; modified: string }[]
  }> {
    try {
      const saves = await this.factorioRconService.listSaves()
      const formattedSaves = saves.map((save) => ({
        name: save.name,
        size: save.size,
        modified: save.modified.toISOString(),
      }))

      return {
        message: `Found ${saves.length} save file(s)`,
        saves: formattedSaves,
      }
    } catch (error) {
      this.handleError('Failed to list save files', error)
    }
  }

  @Post('load/:filename')
  async loadSave(
    @Param('filename') filename: string
  ): Promise<{ message: string; saveName: string; result: string }> {
    try {
      const result = await this.factorioRconService.loadSave(filename)
      return {
        message: 'Save loaded successfully',
        saveName: filename,
        result: result.trim(),
      }
    } catch (error) {
      this.handleError(`Failed to load save '${filename}'`, error)
    }
  }

  @Post('upload-save')
  @UseInterceptors(
    FileInterceptor('saveFile', {
      limits: {
        fileSize: 500 * 1024 * 1024, // 500MB max file size
      },
      fileFilter: (_, file, callback) => {
        if (!file.originalname.toLowerCase().endsWith('.zip')) {
          return callback(new Error('Only .zip save files are allowed'), false)
        }
        callback(null, true)
      },
    })
  )
  async uploadSave(
    @UploadedFile() file: Express.Multer.File,
    @Body('autoLoad') autoLoad?: string
  ): Promise<{
    message: string
    fileName: string
    uploadSize: number
    loadResult?: string
  }> {
    if (!file) {
      throw new HttpException(
        'No save file provided. Use "saveFile" field name.',
        HttpStatus.BAD_REQUEST
      )
    }

    try {
      const shouldAutoLoad = autoLoad === 'true' || autoLoad === '1'

      this.logger.log(
        `Processing uploaded save file: ${file.originalname} (${file.size} bytes)${shouldAutoLoad ? ' with auto-load' : ''}`
      )

      const result = await this.factorioRconService.uploadAndLoadSave(
        file.buffer,
        file.originalname,
        shouldAutoLoad
      )

      return {
        message: result.message,
        fileName: result.fileName,
        uploadSize: file.size,
        loadResult: result.loadResult,
      }
    } catch (error) {
      this.handleError(
        `Failed to upload save file '${file?.originalname}'`,
        error
      )
    }
  }

  private async setSpeed(
    @Param('multiplier') multiplier: string
  ): Promise<{ message: string; speed: string }> {
    const speedMap = {
      slow: '0.1',
      normal: '1',
      fast: '2',
    }

    if (!(multiplier in speedMap)) {
      throw new HttpException(
        'Invalid speed multiplier. Use: slow, normal, fast',
        HttpStatus.BAD_REQUEST
      )
    }

    try {
      const speed = speedMap[multiplier as keyof typeof speedMap]
      await this.factorioRconService.executeCommand(`/c game.speed = ${speed}`)
      return {
        message: `Server speed set to ${speed}x${multiplier === 'normal' ? ' (normal)' : ''}`,
        speed,
      }
    } catch (error) {
      this.handleError('Failed to set server speed', error)
    }
  }
}
