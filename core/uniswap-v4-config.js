/**
 * Uniswap V4 Contract Addresses on Base
 * Updated deployment addresses for advanced DEX interactions
 */

const UNISWAP_V4_BASE = {
    chainId: 8453,

    // Core V4 contracts
    PoolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
    PositionManager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
    PositionDescriptor: '0x25d093633990dc94bedeed76c8f3cdaa75f3e7d5',

    // Trading and quoting
    UniversalRouter: '0x6ff5693b99212da76ad316178a184ab56d299b43',
    Quoter: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',

    // Utilities
    StateView: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
    Permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',

    // Token addresses
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',

    // Legacy V3 for fallback
    V3_Router: '0x2626664c2603336E57B271c5C0b26F421741e481',
    V3_Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD'
};

// ABI fragments for V4 interactions
const UNISWAP_V4_ABI = {
    PoolManager: [
        "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick)",
        "function getLiquidity(bytes32 poolId) view returns (uint128)",
        "function getPosition(bytes32 poolId, address owner, int24 tickLower, int24 tickUpper, bytes32 salt) view returns (uint128 liquidity)"
    ],

    PositionManager: [
        "function mint(address recipient, bytes32 poolKey, int24 tickLower, int24 tickUpper, uint256 liquidity, uint128 amount0Max, uint128 amount1Max, address hookData) payable returns (uint256 tokenId)",
        "function burn(uint256 tokenId, uint128 amount0Min, uint128 amount1Min, bytes hookData) payable returns (uint256 amount0, uint256 amount1)"
    ],

    UniversalRouter: [
        "function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) payable",
        "function execute(bytes calldata commands, bytes[] calldata inputs) payable"
    ],

    Quoter: [
        "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
    ]
};

// Hook addresses (empty hooks for basic swaps)
const HOOKS = {
    ZERO_ADDRESS: '0x0000000000000000000000000000000000000000'
};

module.exports = {
    UNISWAP_V4_BASE,
    UNISWAP_V4_ABI,
    HOOKS
};