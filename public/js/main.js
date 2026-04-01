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
import { 
    createQuest, 
    startQuest, 
    answerQuest,
    createQuestStudioNet,
    startQuestStudioNet,
    answerQuestStudioNet
} from './quests.js';

setCheckPageImpl(checkPageImpl);

const WalletUI = {
    connectWalletAndEnsureNetwork,
    connect,
    disconnect,
    init,
    isConnected,
    getAddress,
    ensureConnected,
    checkPage,
    createQuest,
    startQuest,
    answerQuest,
    createQuestStudioNet,
    startQuestStudioNet,
    answerQuestStudioNet
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