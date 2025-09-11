import { Controller, Get, HttpCode, HttpStatus, Logger } from '@nestjs/common'
import { RconService } from '../services/rcon/rcon.service'
import { IRconResponse } from '../services/rcon/rcon.types'

@Controller('game')
export class FactorioController {
  private readonly logger = new Logger(FactorioController.name)

  constructor(private readonly rconService: RconService) {}

  @Get('slow')
  @HttpCode(HttpStatus.OK)
  async slowGame(): Promise<IRconResponse> {
    this.logger.log('Executing slow game command')

    try {
      const result = await this.rconService.executeCommand(
        '/c game.speed = 0.1'
      )

      if (result.status === 'success') {
        return {
          status: 'success',
          message: 'Game speed set to 0.1x (slow motion)',
          details: 'Use /api/game/speed-up to restore normal speed',
        }
      }

      return result
    } catch (error) {
      this.logger.error(`Unexpected error in slow_game: ${error.message}`)

      return {
        status: 'error',
        message: 'Internal error',
        details: error.message,
      }
    }
  }

  @Get('speed-up')
  @HttpCode(HttpStatus.OK)
  async speedUpGame(): Promise<IRconResponse> {
    this.logger.log('Executing speed up game command')

    try {
      const result = await this.rconService.executeCommand(
        '/c game.speed = 1.0'
      )

      if (result.status === 'success') {
        return {
          status: 'success',
          message: 'Game speed restored to 1.0x (normal speed)',
          details: 'Players can resume normal gameplay',
        }
      }

      return result
    } catch (error) {
      this.logger.error(`Unexpected error in speed_up_game: ${error.message}`)

      return {
        status: 'error',
        message: 'Internal error',
        details: error.message,
      }
    }
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  async getGameStatus(): Promise<IRconResponse> {
    this.logger.log('Checking game status')

    try {
      const result = await this.rconService.executeCommand('/time')

      if (result.status === 'success') {
        return {
          status: 'success',
          message: 'Game server is responding',
          details: result.details,
        }
      }

      return result
    } catch (error) {
      this.logger.error(`Unexpected error in get_status: ${error.message}`)

      return {
        status: 'error',
        message: 'Internal error',
        details: error.message,
      }
    }
  }
}
