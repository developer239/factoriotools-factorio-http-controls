import { Module } from '@nestjs/common'
import { GameModule } from './game/game.module'
import { ServerModule } from './server/server.module'

@Module({
  imports: [GameModule, ServerModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
