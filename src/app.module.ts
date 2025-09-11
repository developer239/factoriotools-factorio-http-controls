import { Module } from '@nestjs/common'
import { FactorioModule } from './factorio.module'

@Module({
  imports: [FactorioModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
