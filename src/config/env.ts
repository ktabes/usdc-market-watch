import { z } from 'zod';

const postgresUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
    message: 'must use the postgres:// or postgresql:// scheme',
  });

const rpcUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://') || value.startsWith('http://'), {
    message: 'must use the http:// or https:// scheme',
  });

const integerString = (name: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER) =>
  z
    .string()
    .regex(/^\d+$/, `${name} must be a base-10 integer`)
    .transform((value) => Number(value))
    .pipe(z.number().int().min(minimum).max(maximum).safe());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: postgresUrl,
  HYPEREVM_RPC_URL: rpcUrl,
  HYPEREVM_ARCHIVE_RPC_URL: rpcUrl,
  HYPEREVM_CHAIN_ID: integerString('HYPEREVM_CHAIN_ID', 1),
  CONFIRMATION_LAG: integerString('CONFIRMATION_LAG', 0),
  LOG_BLOCK_CHUNK_SIZE: integerString('LOG_BLOCK_CHUNK_SIZE', 1, 50),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export interface AppEnv {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly databaseUrl: string;
  readonly hyperEvmRpcUrl: string;
  readonly hyperEvmArchiveRpcUrl: string;
  readonly hyperEvmChainId: number;
  readonly confirmationLag: number;
  readonly logBlockChunkSize: number;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export class EnvironmentValidationError extends Error {
  readonly issues: readonly string[];

  constructor(error: z.ZodError) {
    const issues = error.issues.map((issue) => {
      const path = issue.path.join('.') || 'environment';
      return `${path}: ${issue.message}`;
    });
    super(`Invalid environment configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'EnvironmentValidationError';
    this.issues = issues;
  }
}

export function parseEnv(source: NodeJS.ProcessEnv): AppEnv {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    throw new EnvironmentValidationError(result.error);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    databaseUrl: result.data.DATABASE_URL,
    hyperEvmRpcUrl: result.data.HYPEREVM_RPC_URL,
    hyperEvmArchiveRpcUrl: result.data.HYPEREVM_ARCHIVE_RPC_URL,
    hyperEvmChainId: result.data.HYPEREVM_CHAIN_ID,
    confirmationLag: result.data.CONFIRMATION_LAG,
    logBlockChunkSize: result.data.LOG_BLOCK_CHUNK_SIZE,
    logLevel: result.data.LOG_LEVEL,
  };
}
