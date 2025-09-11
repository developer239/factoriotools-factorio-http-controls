import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const logger = new Logger('Bootstrap')

  const app = await NestFactory.create(AppModule)

  // Enable CORS for web requests if needed
  app.enableCors()

  // Global prefix for all routes
  app.setGlobalPrefix('api')

  const port = process.env.HTTP_PORT || 8080

  await app.listen(port)

  logger.log(`🚀 Factorio Management Server is running on port ${port}`)
  logger.log(`📡 Available endpoints (all GET requests):`)
  logger.log(`   Game Management:`)
  logger.log(
    `   GET  http://localhost:${port}/api/game/slow       - Slow game to 0.1x`
  )
  logger.log(
    `   GET  http://localhost:${port}/api/game/speed-up   - Normal speed 1.0x`
  )
  logger.log(
    `   GET  http://localhost:${port}/api/game/status     - Game status`
  )
  logger.log(`   Server Management:`)
  logger.log(
    `   GET  http://localhost:${port}/api/server/status   - Server status`
  )
  logger.log(
    `   GET  http://localhost:${port}/api/server/start    - Start server`
  )
  logger.log(
    `   GET  http://localhost:${port}/api/server/stop     - Stop server`
  )
  logger.log(
    `💡 All endpoints accessible via browser - no authentication needed!`
  )
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
