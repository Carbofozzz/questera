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