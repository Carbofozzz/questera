import { initMain, getQuest } from './quests.js';
import { getStat } from './portfolio.js';

function checkPageImpl() {
    const pageName = document.body.dataset.pageName;
    switch (pageName) {
        case 'main':
            initMain();
            break;
        case 'quest':
            getQuest(document.body.dataset.questId);
            break;
        case 'portfolio':
            getStat();
            break;
        default:
            console.log('Page has no data-page-name');
    }
}

export { checkPageImpl };