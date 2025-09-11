import { Module } from '@nestjs/common'
import { InstanceService } from '../instance/instance.service'
import { ServerController } from './server.controller'

@Module({
  controllers: [ServerController],
  providers: [InstanceService],
  exports: [InstanceService],
})
export class ServerModule {}
