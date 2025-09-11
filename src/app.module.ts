import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { factorioConfig } from './config/factorio.config'
import { FactorioController } from './controllers/factorio.controller'
import { FactorioRconService } from './services/factorio-rcon.service'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [factorioConfig],
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  controllers: [FactorioController],
  providers: [FactorioRconService],
})
export class AppModule {}
