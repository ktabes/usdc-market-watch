import { z } from 'zod';

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const uintStringSchema = z.string().regex(/^\d+$/);

export const marketManifestSchema = z.object({
  schemaVersion: z.literal(1),
  manifestId: z.string().min(1),
  generatedAt: z.string().datetime(),
  abiVersion: z.string().min(1),
  source: z.object({
    documentationObservedAt: z.string().date(),
    contractAddressesUrl: z.string().url(),
    corePoolsUrl: z.string().url(),
    dataAndIndexersUrl: z.string().url(),
    coreRepositoryUrl: z.string().url(),
    coreSourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
    candidateDiscrepancies: z.array(
      z.object({
        name: z.string().min(1),
        publishedCandidate: addressSchema,
        validatedAddress: addressSchema,
        resolution: z.string().min(1),
      }),
    ),
  }),
  chain: z.object({
    name: z.literal('HyperEVM'),
    chainId: z.literal(999),
    transport: z.literal('direct JSON-RPC; runtime URL intentionally omitted'),
  }),
  pinnedBlock: z.object({
    number: uintStringSchema,
    hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    timestamp: uintStringSchema,
  }),
  contracts: z.record(
    z.string(),
    z.object({
      address: addressSchema,
      codeHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
      codeSizeBytes: z.number().int().positive(),
    }),
  ),
  tokens: z.object({
    underlying: z.object({
      address: addressSchema,
      name: z.string().min(1),
      symbol: z.literal('USDC'),
      decimals: z.literal(6),
    }),
    hToken: z.object({
      address: addressSchema,
      name: z.string().min(1),
      symbol: z.string().min(1),
      decimals: z.literal(6),
      underlyingAsset: addressSchema,
      pool: addressSchema,
    }),
    variableDebtToken: z.object({
      address: addressSchema,
      name: z.string().min(1),
      symbol: z.string().min(1),
      decimals: z.literal(6),
      underlyingAsset: addressSchema,
      pool: addressSchema,
    }),
  }),
  oracle: z.object({
    baseCurrency: addressSchema,
    baseCurrencyUnit: uintStringSchema.refine((value) => BigInt(value) > 0n),
    usdcPrice: uintStringSchema.refine((value) => BigInt(value) > 0n),
  }),
  reserve: z.object({
    decimals: z.literal(6),
    ltvBps: uintStringSchema,
    liquidationThresholdBps: uintStringSchema,
    liquidationBonusBps: uintStringSchema,
    reserveFactorBps: uintStringSchema,
    usageAsCollateralEnabled: z.boolean(),
    borrowingEnabled: z.boolean(),
    stableBorrowRateEnabled: z.boolean(),
    isActive: z.literal(true),
    isFrozen: z.boolean(),
    physicalAvailableLiquidity: uintStringSchema,
    virtualUnderlyingBalance: uintStringSchema,
    totalATokenSupply: uintStringSchema,
    totalVariableDebt: uintStringSchema,
    liquidityRateRay: uintStringSchema,
    variableBorrowRateRay: uintStringSchema,
    liquidityIndexRay: uintStringSchema,
    variableBorrowIndexRay: uintStringSchema,
    lastUpdateTimestamp: uintStringSchema,
    deficit: uintStringSchema,
  }),
  checks: z.array(
    z.object({
      name: z.string().min(1),
      status: z.literal('PASS'),
      expected: z.string(),
      actual: z.string(),
    }),
  ),
});

export type MarketManifest = z.infer<typeof marketManifestSchema>;
