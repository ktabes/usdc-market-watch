import { parseAbi } from 'viem';

/**
 * ABI provenance: hyperlendx/hyperlend-core at
 * 7a2632a22ae2e620b69839f9d08fe9419df050d3.
 * Only the Phase 1 read methods and required market events are retained.
 */
export const ABI_VERSION = 'hyperlend-core-7a2632a-phase1-v1';

export const erc20Abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
]);

export const reserveTokenAbi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function UNDERLYING_ASSET_ADDRESS() view returns (address)',
  'function POOL() view returns (address)',
]);

export const addressesProviderAbi = parseAbi([
  'function getPool() view returns (address)',
  'function getPriceOracle() view returns (address)',
  'function getPoolDataProvider() view returns (address)',
]);

export const protocolDataProviderAbi = parseAbi([
  'function ADDRESSES_PROVIDER() view returns (address)',
  'function POOL() view returns (address)',
  'function getAllReservesTokens() view returns ((string symbol,address tokenAddress)[])',
  'function getReserveConfigurationData(address asset) view returns (uint256 decimals,uint256 ltv,uint256 liquidationThreshold,uint256 liquidationBonus,uint256 reserveFactor,bool usageAsCollateralEnabled,bool borrowingEnabled,bool stableBorrowRateEnabled,bool isActive,bool isFrozen)',
  'function getReserveData(address asset) view returns (uint256 unbacked,uint256 accruedToTreasuryScaled,uint256 totalAToken,uint256 totalStableDebt,uint256 totalVariableDebt,uint256 liquidityRate,uint256 variableBorrowRate,uint256 stableBorrowRate,uint256 averageStableBorrowRate,uint256 liquidityIndex,uint256 variableBorrowIndex,uint40 lastUpdateTimestamp)',
  'function getReserveTokensAddresses(address asset) view returns (address aTokenAddress,address stableDebtTokenAddress,address variableDebtTokenAddress)',
  'function getVirtualUnderlyingBalance(address asset) view returns (uint256)',
  'function getReserveDeficit(address asset) view returns (uint256)',
]);

export const poolReadAbi = parseAbi([
  'function getReserveAToken(address asset) view returns (address)',
  'function getReserveVariableDebtToken(address asset) view returns (address)',
  'function getVirtualUnderlyingBalance(address asset) view returns (uint128)',
  'function getReserveDeficit(address asset) view returns (uint256)',
  'function RESERVE_INTEREST_RATE_STRATEGY() view returns (address)',
]);

export const oracleAbi = parseAbi([
  'function BASE_CURRENCY() view returns (address)',
  'function BASE_CURRENCY_UNIT() view returns (uint256)',
  'function getAssetPrice(address asset) view returns (uint256)',
]);

export const poolEventAbi = parseAbi([
  'event Supply(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint16 indexed referralCode)',
  'event Withdraw(address indexed reserve,address indexed user,address indexed to,uint256 amount)',
  'event Borrow(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint8 interestRateMode,uint256 borrowRate,uint16 indexed referralCode)',
  'event Repay(address indexed reserve,address indexed user,address indexed repayer,uint256 amount,bool useATokens)',
  'event LiquidationCall(address indexed collateralAsset,address indexed debtAsset,address indexed user,uint256 debtToCover,uint256 liquidatedCollateralAmount,address liquidator,bool receiveAToken)',
]);
