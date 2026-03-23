import {
    client,
    TransactionStatus,
    contractQuests
} from './core.js';

async function initMain() {
    if (!client) return;
    console.log("[Quests] Start init main")
}

async function getQuest(id) {
    
}

export { 
    initMain,
    getQuest 
};