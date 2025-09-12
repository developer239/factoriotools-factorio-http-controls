import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  )

  app.enableCors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })

  const port = process.env.PORT || 8080
  await app.listen(port)

  Logger.log(
    `🚀 Factorio RCON HTTP Server running on: http://localhost:${port}`
  )
  Logger.log(`API Endpoints:`)
  Logger.log(`GET /factorio/time             - Server time`)
  Logger.log(`GET /factorio/speed/slow       - Set server speed to 0.1x`)
  Logger.log(`GET /factorio/speed/normal     - Set server speed to 1x`)
  Logger.log(`GET /factorio/speed/fast       - Set server speed to 2x`)
  Logger.log(`GET /factorio/pause            - Pause the game`)
  Logger.log(`GET /factorio/unpause          - Unpause the game`)
  Logger.log(`GET /factorio/status           - Get player status`)
  Logger.log(`POST /factorio/save            - Trigger server save`)
  Logger.log(`GET /factorio/saves            - List available save files`)
}

bootstrap().catch((err) => {
  Logger.error('Application failed to start', err)
  process.exit(1)
})
