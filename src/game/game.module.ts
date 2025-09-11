import { Module } from '@nestjs/common'
import { RconService } from '../rcon/rcon.service'
import { GameController } from './game.controller'

@Module({
  controllers: [GameController],
  providers: [RconService],
  exports: [RconService],
})
export class GameModule {}
