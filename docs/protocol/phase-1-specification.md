# Phase 1 Protocol Specification

## Scope and pinned evidence

This specification covers only the HyperLend core-pool USDC reserve on HyperEVM (chain ID `999`). Isolated pools and other reserves are out of scope.

The executable manifest is [`manifests/hyperlend-core-usdc-999-40367898.v1.json`](../../manifests/hyperlend-core-usdc-999-40367898.v1.json). It was produced from the HyperLend archive RPC at block `40367898`:

- Block hash: `0x449364485d42dc493570f3fa7b8a7bb18301bad94da88588b6bd35196c6498fe`
- Block timestamp: `1783961877`
- Confirmation lag when selected: 20 blocks
- ABI version: `hyperlend-core-7a2632a-phase1-v1`

The source hierarchy is:

1. Pinned-block contract state and bytecode.
2. Relationships returned by the onchain PoolAddressesProvider, Pool, and ProtocolDataProvider.
3. Candidate addresses from HyperLend's official documentation.
4. Interfaces and semantics from the official core repository at the pinned source commit.
5. HyperLend's HTTP API only as an optional secondary comparison; it is not used by discovery.

## ABI provenance

The versioned Phase 1 ABI subset is defined in [`src/protocol/abis.ts`](../../src/protocol/abis.ts). It was transcribed from `hyperlendx/hyperlend-core` commit `7a2632a22ae2e620b69839f9d08fe9419df050d3`, primarily from:

- `src/contracts/interfaces/IPool.sol`
- `src/contracts/interfaces/IPoolAddressesProvider.sol`
- `src/contracts/interfaces/IPoolDataProvider.sol`
- `src/contracts/interfaces/IPriceOracleGetter.sol`
- `src/contracts/protocol/configuration/PoolAddressesProvider.sol`
- `src/contracts/helpers/AaveProtocolDataProvider.sol`

Only the reads and events needed for this market specification are retained. The ABI version is embedded in both the manifest and event fixture file.

## Validated contracts

| Role                        | Validated address                            |
| --------------------------- | -------------------------------------------- |
| Pool proxy                  | `0x00A89d7a5A02160f20150EbEA7a2b5E4879A1A8b` |
| Active Pool implementation  | `0xBEBb62C7FF8B96dB4325D9481c44e09A92d49B06` |
| PoolAddressesProvider       | `0x72c98246a98bFe64022a3190e7710E157497170C` |
| Active ProtocolDataProvider | `0x4f4d4cA1e0a8A21FE0B460613bEbe917f2eb4326` |
| Oracle                      | `0xC9Fb4fbE842d57EAc1dF3e641a281827493A630e` |
| Interest-rate strategy      | `0xD01E9AA0ba6a4a06E756BC8C79579E6cef070822` |
| USDC                        | `0xb88339CB7199b77E23DB6E890353E22632Ba630f` |
| hToken                      | `0x744E4f26ee30213989216E1632D9BE3547C4885b` |
| Variable-debt token         | `0xD612513cB3b2C52abCD6d4b338374C09AdA4657d` |

Every entry has non-empty bytecode and a recorded code hash in the manifest. Discovery also verifies the proxy implementation slot, provider back-references, reserve-token relationships, and required reads at the pinned block.

### Resolved published-address discrepancies

- The documentation candidate Pool implementation `0xc19d68383Ed7AB130c15cEad839e67A7Ed9d7041` has code, but the Pool proxy's EIP-1967 implementation slot resolves to `0xBEBb...9B06` at the pinned block. The onchain slot wins.
- The documentation candidate ProtocolDataProvider `0x5481bf8d3946E6A3168640c1D7523eB59F055a29` has code but does not expose the current `POOL()` interface. `PoolAddressesProvider.getPoolDataProvider()` resolves to `0x4f4d...4326`, whose Pool and provider back-references validate. The registry result wins.

Both candidates remain in the manifest as source evidence rather than being silently discarded.

## Reserve identity and configuration

USDC, hToken, and variable-debt token all use 6 decimals. The hToken and variable-debt token independently return the validated USDC underlying and Pool addresses. At the pinned block the reserve was active, unfrozen, collateral-enabled, and variable borrowing was enabled; stable-rate borrowing was disabled.

The manifest preserves the raw integer configuration and state, including LTV, liquidation threshold and bonus, reserve factor, liquidity and borrow indexes, rates, virtual balance, debt, deficit, total hToken supply, physical token balance, and oracle price with its base currency and unit.

## Normalized event contract

All addresses are EIP-55 checksummed and all financial integers remain `bigint` in application code. Raw log identity and storage are Phase 2 responsibilities.

| Event             | Normalized financial fields                             | USDC inclusion rule                              |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------ |
| `Supply`          | `amountBaseUnits`                                       | `reserve == USDC`                                |
| `Withdraw`        | `amountBaseUnits`                                       | `reserve == USDC`                                |
| `Borrow`          | `amountBaseUnits`, `borrowRateRay`                      | `reserve == USDC`                                |
| `Repay`           | `amountBaseUnits`                                       | `reserve == USDC`                                |
| `LiquidationCall` | `debtToCoverBaseUnits`, `liquidatedCollateralBaseUnits` | `debtAsset == USDC` or `collateralAsset == USDC` |

The complete normalized shapes, including actors, referral code, rate mode, repayment source, and liquidation mode, are defined in [`src/protocol/events.ts`](../../src/protocol/events.ts).

## Units, formulas, and rounding

### Units

- USDC, hUSDC, and variable-debt-USDC amounts use base units, `U = 10^6`.
- Event amounts are always in the named asset's base units. In `LiquidationCall`, `debtToCoverBaseUnits` uses `debtAsset` decimals and `liquidatedCollateralBaseUnits` uses `collateralAsset` decimals; a non-USDC side must never be interpreted with 6 decimals.
- Rates, indexes, utilization, and APY use ray fixed point, `RAY = 10^27`.
- Basis-point configuration uses `BPS = 10^4`.
- Financial computation uses integers only. Decimal formatting occurs at presentation boundaries and never converts through JavaScript `number`.
- Oracle prices are denominated in `BASE_CURRENCY()` units. The manifest records `BASE_CURRENCY_UNIT()` beside the raw price, making the scale executable instead of relying on a documentation assumption. At the pinned block the base-currency sentinel is the zero address, the unit is `100000000` (USD with 8 decimals under the official interface convention), and the USDC price is `99972927`, or exactly `0.99972927` USD.

### Authoritative state

- Physical available liquidity: `USDC.balanceOf(hToken)`.
- Rate-model available liquidity: `Pool.getVirtualUnderlyingBalance(USDC)`.
- Variable debt: variable-debt-token `totalSupply()`, cross-checked against ProtocolDataProvider reserve data.
- hToken supply: hToken `totalSupply()`, cross-checked against ProtocolDataProvider reserve data.

Physical and virtual liquidity happen to be equal at the pinned block but are stored separately because protocol accounting can make them diverge.

### Utilization

For the variable-only reserve:

```text
utilizationRay = roundHalfUp(variableDebt * RAY / (virtualUnderlyingBalance + variableDebt))
```

If variable debt is zero, utilization is zero. Negative inputs are invalid. The denominator includes the rate-model virtual balance, not merely the physical token balance.

### Event-derived volumes and state effects

For an interval, using only included USDC-market events, user-facing principal volume is:

```text
userNetSupplyVolume = sum(Supply.amount) - sum(Withdraw.amount)

netVariableDebtPrincipal = sum(Borrow.amount where interestRateMode == 2)
                         - sum(Repay.amount)
                         - sum(LiquidationCall.debtToCover where debtAsset == USDC)
```

`userNetSupplyVolume` answers how much users supplied versus withdrew, but it is not an hToken-supply or liquidity reconciliation formula. The event flags and asset roles produce additional state effects:

```text
hTokenPrincipalDelta = sum(Supply.amount)
                     - sum(Withdraw.amount)
                     - sum(Repay.amount where useATokens == true)
                     - sum(LiquidationCall.liquidatedCollateralAmount
                           where collateralAsset == USDC
                           and receiveAToken == false)

underlyingLiquidityPrincipalDelta = sum(Supply.amount)
                                  - sum(Withdraw.amount)
                                  - sum(Borrow.amount)
                                  + sum(Repay.amount where useATokens == false)
                                  + sum(LiquidationCall.debtToCover
                                        where debtAsset == USDC)
                                  - sum(LiquidationCall.liquidatedCollateralAmount
                                        where collateralAsset == USDC
                                        and receiveAToken == false)
```

An aToken repayment (`Repay.useATokens == true`) burns hUSDC and variable debt without transferring underlying into the reserve. A collateral-side USDC liquidation with `receiveAToken == true` transfers hUSDC ownership without changing total hToken supply; with `false`, it burns hUSDC and transfers underlying out. A debt-side USDC liquidation transfers debt-covering underlying in and reduces variable debt.

`Borrow.interestRateMode == 2` is the supported variable-debt mode. A historical non-2 Borrow is an unsupported configuration/version boundary that must halt or be handled by an explicitly versioned decoder; it must not be silently counted as variable debt. Stable borrowing is disabled and stable debt is zero at the pinned block.

For liquidation-volume reporting, select `debtToCoverBaseUnits` only when `debtAsset == USDC`, and select `liquidatedCollateralBaseUnits` only when `collateralAsset == USDC`. These are separate USDC debt-repayment and USDC collateral-outflow measures; the non-USDC side is not added to either.

The liquidity formula is a principal-event expectation that must be compared separately to both physical token balance and protocol virtual balance. It does not alone explain accrued interest, scaled-token rounding, treasury minting, donations, deficits, unbacked accounting, or other protocol state transitions. Phase 4 reconciliation must name and test those components rather than comparing `userNetSupplyVolume` directly to hToken supply or liquidity movement.

### Rates and APY

The Pool's liquidity and variable-borrow rates are annualized ray rates. Human-readable APR is `rateRay / RAY`. The deterministic APY conversion compounds a truncated per-second ray rate with half-up ray multiplication:

```text
perSecondRateRay = floor(annualRateRay / 31_536_000)
apyRay = rayPow(RAY + perSecondRateRay, 31_536_000) - RAY
rayMulHalfUp(a, b) = floor((a * b + RAY / 2) / RAY)
```

This display APY is distinct from the protocol's index-accrual implementation, which uses its own linear/binomial time approximations for liquidity and borrow indexes.

### Reconciliation tolerance

Phase 1 defines exact identities only: address relationships, decimals, raw log decoding, and pure integer formulas must match exactly. Economic reconciliation tolerances depend on the interval and on explicitly modeled interest/accounting components; their numeric thresholds are deliberately deferred to Phase 4 and must not be invented by the indexer.

## Recorded real-log fixtures

[`fixtures/events/hyperlend-usdc-core.v1.json`](../../fixtures/events/hyperlend-usdc-core.v1.json) records exact topics/data, block identity, transaction identity, source links, and expected normalized fields for five public transactions:

| Event                          | Transaction                                                          |
| ------------------------------ | -------------------------------------------------------------------- |
| Supply                         | `0x41f2b1d9e5356d0893b2ab23cfddbd9750a994a99c39171d4a3eddf530f0e9ea` |
| Withdraw                       | `0xf12e64e43bc9a91c2a4d2f07324e6443b20fb655831b5b6b76be239abf999f48` |
| Borrow                         | `0xfa4fe80e18e50ae96a0428e064812e93dbf58dd365d3a5438fb17a5743a28880` |
| Repay                          | `0xab54e4b90129d3629a538b11b55be08894390bcd0142086fb662b8037e1632ab` |
| LiquidationCall with USDC debt | `0xa245128a0e1bb233f30fe458ccf57394fa01fcbacafe13928c2afba1581811c2` |

## Reproducing discovery

```bash
npm run discover -- --block 40367898 \
  --rpc-url https://rpc.hyperlend.finance/archive
```

Add `--out <new-path>` to create an immutable file. The command refuses to overwrite an existing output. Discovery fails closed on the wrong chain, absent code, or any address/metadata/configuration relationship mismatch.

The runtime transport URL is deliberately omitted from stdout and manifest evidence. `--rpc-url` accepts only public non-secret HTTP(S) endpoints without userinfo, query parameters, or fragments; never put credentials in an RPC path.

Phase 2 remains blocked until the Phase 1 evidence record is approved.
