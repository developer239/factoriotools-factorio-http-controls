import { Module } from '@nestjs/common'
import { FactorioController } from './controllers/factorio.controller'
import { RconService } from './services/rcon/rcon.service'

@Module({
  controllers: [FactorioController],
  providers: [RconService],
  exports: [RconService],
})
export class FactorioModule {}
