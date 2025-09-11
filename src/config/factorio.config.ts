import { z } from 'zod'

export const factorioConfigSchema = z.object({
  rcon: z.object({
    host: z.string().default('localhost'),
    port: z.number().int().positive().default(27015),
    password: z.string().min(1, 'RCON password is required'),
    timeout: z.number().int().positive().default(5000),
    maxRetries: z.number().int().min(0).default(3),
  }),
  server: z.object({
    saveName: z.string().default('default'),
    serverSettingsPath: z.string().optional(),
    modsPath: z.string().optional(),
    autoStart: z.boolean().default(false),
  }),
})

export type FactorioConfig = z.infer<typeof factorioConfigSchema>

export const factorioConfig = (): { factorio: FactorioConfig } => {
  const config = factorioConfigSchema.parse({
    rcon: {
      host: process.env.FACTORIO_RCON_HOST || 'localhost',
      port: parseInt(process.env.FACTORIO_RCON_PORT || '27015', 10),
      password: process.env.FACTORIO_RCON_PASSWORD,
      timeout: parseInt(process.env.FACTORIO_RCON_TIMEOUT || '5000', 10),
      maxRetries: parseInt(process.env.FACTORIO_RCON_MAX_RETRIES || '3', 10),
    },
    server: {
      saveName: process.env.FACTORIO_SAVE_NAME || 'default',
      serverSettingsPath: process.env.FACTORIO_SERVER_SETTINGS_PATH,
      modsPath: process.env.FACTORIO_MODS_PATH,
      autoStart: process.env.FACTORIO_AUTO_START === 'true',
    },
  })

  return { factorio: config }
}
