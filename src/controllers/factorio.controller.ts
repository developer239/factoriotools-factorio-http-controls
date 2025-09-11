import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { FactorioRconService } from '../services/factorio-rcon.service'

@Controller('factorio')
export class FactorioController {
  private readonly logger = new Logger(FactorioController.name)

  constructor(private readonly factorioRconService: FactorioRconService) {}

  // TODO: implement set server speed to 0.1 (GET endpoint)

  // TODO: implement set server speed to 1 (GET endpoint)

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
}
