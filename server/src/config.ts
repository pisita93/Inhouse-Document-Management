import { z } from 'zod';
import path from 'node:path';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5900),
  DATA_DIR: z.string().min(1, 'DATA_DIR is required'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export interface AppConfig {
  port: number;
  dataDir: string;
  nodeEnv: 'development' | 'test' | 'production';
  dbPath: string;
  fileRoot: string;
}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): AppConfig {
  const parsed = EnvSchema.parse(env);
  return {
    port: parsed.PORT,
    dataDir: parsed.DATA_DIR,
    nodeEnv: parsed.NODE_ENV,
    dbPath: path.posix.join(parsed.DATA_DIR, 'db', 'receipts.db'),
    fileRoot: path.posix.join(parsed.DATA_DIR, 'file'),
  };
}
