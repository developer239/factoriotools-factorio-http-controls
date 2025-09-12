import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { FactorioRconService } from '../services/factorio-rcon.service'

@Controller('factorio')
export class FactorioController {
  private readonly logger = new Logger(FactorioController.name)

  constructor(private readonly factorioRconService: FactorioRconService) {}

  @Get('time')
  async getServerTime(): Promise<{ time: string }> {
    try {
      const time = await this.factorioRconService.getServerTime()
      return { time }
    } catch (error) {
      this.logger.error(
        `Failed to get server time: ${error instanceof Error ? error.message : String(error)}`
      )
      throw new HttpException(
        'Failed to get server time',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  @Get('speed/slow')
  async setSlowSpeed(): Promise<{ message: string; speed: string }> {
    try {
      await this.factorioRconService.executeCommand('/c game.speed = 0.1')
      return {
        message: 'Server speed set to 0.1x',
        speed: '0.1',
      }
    } catch (error) {
      this.logger.error(
        `Failed to set slow speed: ${error instanceof Error ? error.message : String(error)}`
      )
      throw new HttpException(
        'Failed to set server speed',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  @Get('speed/normal')
  async setNormalSpeed(): Promise<{ message: string; speed: string }> {
    try {
      await this.factorioRconService.executeCommand('/c game.speed = 1')
      return {
        message: 'Server speed set to 1x (normal)',
        speed: '1',
      }
    } catch (error) {
      this.logger.error(
        `Failed to set normal speed: ${error instanceof Error ? error.message : String(error)}`
      )
      throw new HttpException(
        'Failed to set server speed',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  @Get('speed/fast')
  async setFastSpeed(): Promise<{ message: string; speed: string }> {
    try {
      await this.factorioRconService.executeCommand('/c game.speed = 2')
      return {
        message: 'Server speed set to 2x (fast)',
        speed: '2',
      }
    } catch (error) {
      this.logger.error(
        `Failed to set fast speed: ${error instanceof Error ? error.message : String(error)}`
      )
      throw new HttpException(
        'Failed to set server speed',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  @Get('pause')
  async pauseGame(): Promise<{ message: string }> {
    try {
      await this.factorioRconService.executeCommand('/pause')
      return { message: 'Game paused' }
    } catch (error) {
      this.logger.error(
        `Failed to pause game: ${error instanceof Error ? error.message : String(error)}`
      )
      throw new HttpException(
        'Failed to pause game',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  @Get('unpause')
  async unpauseGame(): Promise<{ message: string }> {
    try {
      await this.factorioRconService.executeCommand('/unpause')
      return { message: 'Game unpaused' }
    } catch (error) {
      this.logger.error(
        `Failed to unpause game: ${error instanceof Error ? error.message : String(error)}`
      )
      throw new HttpException(
        'Failed to unpause game',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  @Get('status')
  async getServerStatus(): Promise<{ status: string }> {
    try {
      const status = await this.factorioRconService.executeCommand('/players')
      return { status }
    } catch (error) {
      this.logger.error(
        `Failed to get server status: ${error instanceof Error ? error.message : String(error)}`
      )
      throw new HttpException(
        'Failed to get server status',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
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
      this.logger.error(
        `Failed to trigger save: ${error instanceof Error ? error.message : String(error)}`
      )
      throw new HttpException(
        'Failed to trigger save',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  @Get('saves')
  async listSaves(): Promise<{
    message: string
    saves: { name: string; size: number; modified: string }[]
  }> {
    try {
      const saves = await this.factorioRconService.listSaves()

      // Convert dates to ISO strings for JSON response
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
      this.logger.error(
        `Failed to list saves: ${error instanceof Error ? error.message : String(error)}`
      )
      throw new HttpException(
        'Failed to list save files',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
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
      this.logger.error(
        `Failed to load save '${filename}': ${error instanceof Error ? error.message : String(error)}`
      )
      throw new HttpException(
        'Failed to load save',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  @Post('upload-save')
  @UseInterceptors(
    FileInterceptor('saveFile', {
      limits: {
        fileSize: 500 * 1024 * 1024, // 500MB max file size
      },
      fileFilter: (req, file, callback) => {
        if (!file.originalname.toLowerCase().endsWith('.zip')) {
          return callback(
            new Error('Only .zip save files are allowed'),
            false
          )
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
      this.logger.error(
        `Failed to upload save file '${file?.originalname}': ${error instanceof Error ? error.message : String(error)}`
      )
      throw new HttpException(
        `Failed to upload save file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
