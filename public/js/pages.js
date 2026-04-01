import { initMain, initMainStudio, getQuest, getQuestStudio } from './quests.js';
import { getStat, getStatStudio } from './portfolio.js';

function checkPageImpl() {
    const pageName = document.body.dataset.pageName;
    switch (pageName) {
        case 'main':
            initMain();
            break;
        case 'main-studio':
            initMainStudio();
            break;
        case 'quest':
            getQuest(document.body.dataset.questId);
            break;
        case 'quest-studio':
            getQuestStudio(document.body.dataset.questId);
            break;
        case 'portfolio':
            getStat();
            break;
        case 'portfolio-studio':
            getStatStudio();
            break;
        default:
            console.log('Page has no data-page-name');
    }
}

export { checkPageImpl };