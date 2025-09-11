import { Controller, Get, Logger } from '@nestjs/common'
import { InstanceResponse, InstanceService } from '../instance/instance.service'

@Controller('server')
export class ServerController {
  private readonly logger = new Logger(ServerController.name)

  constructor(private readonly instanceService: InstanceService) {}

  @Get('status')
  async getServerStatus(): Promise<InstanceResponse> {
    this.logger.log('Getting server status')
    return await this.instanceService.getInstanceStatus()
  }

  @Get('start')
  async startServer(): Promise<InstanceResponse> {
    this.logger.log('Starting server')
    return await this.instanceService.startInstance()
  }

  @Get('stop')
  async stopServer(): Promise<InstanceResponse> {
    this.logger.log('Stopping server')
    return await this.instanceService.stopInstance()
  }
}
