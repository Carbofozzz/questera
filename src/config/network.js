import dotenv from 'dotenv';

dotenv.config();

export const bradburyNetwork = {
    chainIdHex: '0x107D',
    chainName: 'GenLayer Bradbury',
    rpcUrls: ('https://zksync-os-testnet-genlayer.zksync.dev').split(','),
    nativeCurrency: {
        name: process.env.NATIVE_CURRENCY_NAME || 'GEN',
        symbol: process.env.NATIVE_CURRENCY_SYMBOL || 'GEN',
        decimals: 18,
    },
    blockExplorerUrls: ('http://explorer-bradbury.genlayer.com/','https://zksync-os-testnet-genlayer.explorer.zksync.dev/').split(','),
};
  
export const baseSepoliaNetwork = {
    chainIdHex: '0x14A34',
    chainName: 'Base Sepolia',
    rpcUrls: ('https://sepolia.base.org').split(','),
    nativeCurrency: {
        name: 'ETH',
        symbol: 'ETH',
        decimals: 18,
    },
    blockExplorerUrls: ('https://etherscan.io').split(','),
};

export function getPrivateKey() {
    return process.env.PRIVATE_KEY || "";
}

export function getBaseRpcUrl() {
    return process.env.BASE_SEPOLIA_RPC_URL || "";
}

export function getBaseBridgeIn() {
    return process.env.EVM_BRIDGE_IN || "";
}

export function getBaseBridgeOut() {
    return process.env.EVM_BRIDGE_OUT || "";
}

export function getBaseUSDC() {
    return process.env.BASE_SEPOLIA_USDC || "";
}

export function getBradburyBridgeIn() {
    return process.env.IC_BRIDGE_IN || "";
}

export function getBradburyBridgeOut() {
    return process.env.IC_BRIDGE_OUT || "";
}

export function getBradburyQuests() {
    return process.env.IC_QUESTS || "";
}

export function getRelayer() {
    return process.env.RELAYER || "";
}