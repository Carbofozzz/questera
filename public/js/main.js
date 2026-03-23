import {
    init,
    connect,
    disconnect,
    connectWalletAndEnsureNetwork,
    isConnected,
    getAddress,
    ensureConnected,
    setCheckPageImpl,
    checkPage,
} from './core.js';

import { checkPageImpl } from './pages.js';

setCheckPageImpl(checkPageImpl);

const WalletUI = {
    connectWalletAndEnsureNetwork,
    connect,
    disconnect,
    init,
    isConnected,
    getAddress,
    ensureConnected,
    checkPage
};
  
if (typeof window !== 'undefined') {
    window.WalletUI = WalletUI;
    window.addEventListener('DOMContentLoaded', () => {
        try { 
            WalletUI.init(); 
        } catch (e) { 
            console.error(e); 
        }
    });
}
  
export default WalletUI;