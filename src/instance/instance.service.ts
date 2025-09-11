import { InstancesClient } from '@google-cloud/compute'
import { Injectable, Logger } from '@nestjs/common'

export interface InstanceResponse {
  status: 'success' | 'error'
  message: string
  details?: string
}

export interface InstanceStatus {
  instanceName: string
  status: string
  machineType: string
  externalIP: string
  staticIP: string
  zone: string
}

@Injectable()
export class InstanceService {
  private readonly logger = new Logger(InstanceService.name)
  private readonly computeClient: InstancesClient

  // These should match your Terraform configuration
  private readonly projectId =
    process.env.GOOGLE_CLOUD_PROJECT || 'your-project-id'

  private readonly zone = process.env.ZONE || 'europe-west4-a'
  private readonly instanceName = process.env.INSTANCE_NAME || 'factorio-server'

  constructor() {
    this.computeClient = new InstancesClient()
  }

  async getInstanceStatus(): Promise<InstanceResponse> {
    try {
      this.logger.log('Getting instance status...')

      const [instance] = await this.computeClient.get({
        project: this.projectId,
        zone: this.zone,
        instance: this.instanceName,
      })

      const status = instance.status || 'UNKNOWN'
      const machineType = instance.machineType?.split('/').pop() || 'unknown'

      // Get external IP
      let externalIP = 'N/A'
      if (instance.networkInterfaces && instance.networkInterfaces.length > 0) {
        const { accessConfigs } = instance.networkInterfaces[0]
        if (accessConfigs && accessConfigs.length > 0) {
          externalIP = accessConfigs[0].natIP || 'N/A'
        }
      }

      const instanceStatus: InstanceStatus = {
        instanceName: this.instanceName,
        status,
        machineType,
        externalIP,
        staticIP: externalIP, // Same as external for now
        zone: this.zone,
      }

      return {
        status: 'success',
        message: `Instance status: ${status}`,
        details: JSON.stringify(instanceStatus, null, 2),
      }
    } catch (error) {
      this.logger.error(`Failed to get instance status: ${error.message}`)

      return {
        status: 'error',
        message: 'Failed to get instance status',
        details: error.message,
      }
    }
  }

  async startInstance(): Promise<InstanceResponse> {
    try {
      this.logger.log('Starting instance...')

      // Check current status first
      const [currentInstance] = await this.computeClient.get({
        project: this.projectId,
        zone: this.zone,
        instance: this.instanceName,
      })

      if (currentInstance.status === 'RUNNING') {
        return {
          status: 'success',
          message: 'Instance is already running',
          details: 'No action needed - server is already started',
        }
      }

      // Start the instance
      const [operation] = await this.computeClient.start({
        project: this.projectId,
        zone: this.zone,
        instance: this.instanceName,
      })

      this.logger.log(`Start operation initiated: ${operation.name}`)

      return {
        status: 'success',
        message: 'Instance start initiated',
        details:
          'Server is starting up - this may take 1-2 minutes. Check status endpoint for updates.',
      }
    } catch (error) {
      this.logger.error(`Failed to start instance: ${error.message}`)

      return {
        status: 'error',
        message: 'Failed to start instance',
        details: error.message,
      }
    }
  }

  async stopInstance(): Promise<InstanceResponse> {
    try {
      this.logger.log('Stopping instance...')

      // Check current status first
      const [currentInstance] = await this.computeClient.get({
        project: this.projectId,
        zone: this.zone,
        instance: this.instanceName,
      })

      if (currentInstance.status === 'TERMINATED') {
        return {
          status: 'success',
          message: 'Instance is already stopped',
          details: 'No action needed - server is already stopped',
        }
      }

      // Stop the instance
      const [operation] = await this.computeClient.stop({
        project: this.projectId,
        zone: this.zone,
        instance: this.instanceName,
      })

      this.logger.log(`Stop operation initiated: ${operation.name}`)

      return {
        status: 'success',
        message: 'Instance stop initiated',
        details:
          'Server is shutting down gracefully. Factorio will auto-save before stopping.',
      }
    } catch (error) {
      this.logger.error(`Failed to stop instance: ${error.message}`)

      return {
        status: 'error',
        message: 'Failed to stop instance',
        details: error.message,
      }
    }
  }
}
