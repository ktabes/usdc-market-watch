# Phase 3 Analytics and Snapshots

## Scope

Phase 3 derives auditable hourly USDC-market flows and authoritative block-pinned market state. The immutable `blocks`, `raw_logs`, and `market_events` source tables were introduced in Phase 2 because reliable indexing required them; Phase 3 reuses those approved sources instead of duplicating them.

The calculation version is `hyperlend-usdc-phase3-v1`. All amounts, rates, indexes, timestamps, and block numbers remain exact integers. Human formatting is outside the persistence and calculation path.

## Derived tables

| Table                    | Purpose                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `hourly_flow_aggregates` | Rebuildable UTC-hour buckets calculated only from normalized immutable events.                |
| `market_snapshots`       | Authoritative contract state read at one finalized block, with block and contract provenance. |

Each hourly row stores its source block range, event count, per-event counts, manifest ID, calculation version, and exact component totals. Rebuilding occurs in one transaction: the complete current source event set is read, the selected calculation version is replaced, and all new buckets are inserted atomically. Repeated rebuilds therefore do not accumulate rows.

Each snapshot stores the source block number/hash/timestamp, Pool implementation, Pool, ProtocolDataProvider, underlying, hToken, and variable-debt-token addresses, ABI and calculation versions, and a content hash. An exact replay is a duplicate; changed content at the same block and calculation version fails closed.

## Hourly calculations

The UTC bucket is:

```text
hourStart = floor(blockTimestamp / 3600) * 3600
```

The stored event volumes are exact sums of their named USDC fields:

- Supply and withdrawal amounts.
- Variable-mode borrow amounts; a non-2 borrow mode is an unsupported version boundary.
- Repay amounts.
- Liquidation debt repaid only when USDC is the debt asset.
- Liquidation collateral outflow only when USDC is the collateral asset.

The principal effects follow the Phase 1 specification:

```text
userNetSupply = supply - withdraw

netVariableDebtPrincipal = variableBorrow - repay - USDCDebtLiquidation

hTokenPrincipalDelta = supply - withdraw - aTokenRepay
                     - physicalUSDCCollateralLiquidation

underlyingLiquidityPrincipalDelta = supply - withdraw - borrow
                                  + underlyingRepay + USDCDebtLiquidation
                                  - physicalUSDCCollateralLiquidation
```

An aToken repayment reduces hToken and variable-debt principal without adding underlying liquidity. A USDC collateral liquidation changes hToken supply and underlying liquidity only when `receiveAToken == false`. Events outside the manifest USDC market, negative values, and unsupported borrow modes fail closed.

## Authoritative snapshot reads

All reads use the archive RPC at the requested finalized block. The snapshot captures:

- `USDC.balanceOf(hToken)` as physical available liquidity.
- Pool and ProtocolDataProvider virtual underlying balance, which must agree.
- hToken and variable-debt-token `totalSupply()`, each cross-checked against reserve data.
- Stable debt, unbacked, accrued-to-treasury scaled value, and reserve deficit.
- Raw liquidity and variable-borrow rates plus liquidity and variable-borrow indexes.
- Reserve update timestamp, reserve factor, and operational flags.
- Utilization calculated from virtual balance and variable debt using exact half-up ray division.

The reader also verifies the Pool EIP-1967 implementation, the current PoolAddressesProvider data-provider registry entry, the ProtocolDataProvider addresses-provider and Pool back-references, reserve-token addresses, decimals, stable-borrowing boundary, and zero stable debt. A mismatch requires new discovery/versioned protocol evidence; it is not silently accepted.

## Commands

Development commands use TypeScript directly:

```bash
npm run snapshot -- --block 40367898
npm run rebuild:flows
npm run state
npm run flows -- --from-timestamp 1783954800 --to-timestamp 1783958400
```

`state` and `flows` are read-only. Their JSON output represents every bigint as a decimal string.

Production builds provide compiled equivalents:

```bash
npm run build
npm run db:migrate:prod
npm run backfill:prod -- --from-block <a> --to-block <b>
npm run snapshot:prod -- --block <n>
npm run rebuild:flows:prod
npm run state:prod
```

## Railway boundary

The connected Railway worker and PostgreSQL database remain private. Do not apply Phase 3 migrations or enable a scheduled sync until the Phase 3 gate is approved.

After approval, the controlled order is:

1. Apply committed migrations from the built worker.
2. Run and inspect the planned seven-day backfill.
3. Run the resumable full-lifetime backfill through the same Phase 2 code path.
4. Capture a finalized snapshot and rebuild hourly flows.
5. Compare read-only outputs to stored provenance.
6. Only then configure incremental sync scheduling; never run concurrent writers.

The public web/API service remains deferred until after the mandatory Phase 4 owner review.
