import {
    client,
    clientStudioNet,
    contractQuests,
    contractQuestsStudioNet,
    getAddress,
    maskAddress
} from './core.js';

async function getStat() {
    if (!client) return;
    const subtitle = document.getElementById('subtitle');
    const createdQuests = document.getElementById('createdQuests');
    const joinedQuests = document.getElementById('joinedQuests');
    if (subtitle) subtitle.textContent = 'For address: ' + maskAddress(getAddress());
    try {
        const quests = await client.readContract({
            address: contractQuests,
            functionName: "get_my_quests",
            args: [50],
        });
        const parsed = JSON.parse(quests);
        const array = Array.isArray(parsed) ? parsed : [];
        renderCreatedQuests(createdQuests, array, false);
        console.log("[Portfolio] Created Quests:", array)
    } catch(error) {
        console.error('[Portfolio] Created Quests error:', error);
        if (createdQuests) createdQuests.textContent = 'Something went wrong';
    }
    try {
        const quests = await client.readContract({
            address: contractQuests,
            functionName: "get_my_quests_user",
            args: [50],
        });
        const parsed = JSON.parse(quests);
        const array = Array.isArray(parsed) ? parsed : [];
        renderCreatedQuests(joinedQuests, array, false);
        console.log("[Portfolio] Joined Quests:", array)
    } catch(error) {
        console.error('[Portfolio] Joined Quests error:', error);
        if (joinedQuests) joinedQuests.textContent = 'Something went wrong';
    }
}

async function getStatStudio() {
    if (!clientStudioNet) return;
    const subtitle = document.getElementById('subtitle');
    const createdQuests = document.getElementById('createdQuests');
    const joinedQuests = document.getElementById('joinedQuests');
    if (subtitle) subtitle.textContent = 'For address: ' + maskAddress(getAddress());
    try {
        const quests = await clientStudioNet.readContract({
            address: contractQuestsStudioNet,
            functionName: "get_my_quests",
            args: [50],
        });
        const parsed = JSON.parse(quests);
        const array = Array.isArray(parsed) ? parsed : [];
        renderCreatedQuests(createdQuests, array, true);
        console.log("[Portfolio] Created Quests:", array)
    } catch(error) {
        console.error('[Portfolio] Created Quests error:', error);
        if (createdQuests) createdQuests.textContent = 'Something went wrong';
    }
    try {
        const quests = await clientStudioNet.readContract({
            address: contractQuestsStudioNet,
            functionName: "get_my_quests_user",
            args: [50],
        });
        const parsed = JSON.parse(quests);
        const array = Array.isArray(parsed) ? parsed : [];
        renderCreatedQuests(joinedQuests, array, true);
        console.log("[Portfolio] Joined Quests:", array)
    } catch(error) {
        console.error('[Portfolio] Joined Quests error:', error);
        if (joinedQuests) joinedQuests.textContent = 'Something went wrong';
    }
}

function renderCreatedQuests(container, quests, studionet) {
    if (!container) return;
    container.innerHTML = '';

    if (!quests.length) {
        container.textContent = 'There are no quests';
        return;
    }

    const fragment = document.createDocumentFragment();

    quests.forEach((q) => {
        const link = document.createElement('a');
        if (studionet) {
            link.href = `quest-studio/${encodeURIComponent(q.contract)}`;
        } else {
            link.href = `quest/${encodeURIComponent(q.contract)}`;
        }
        link.className = 'portfolio-quest-link';
        link.textContent = `${q.title} — until ${formatDateFromSec(q.end_date)}`;
        fragment.appendChild(link);
    });

    container.appendChild(fragment);
}

function formatDateFromSec(date) {
    const sec = Math.floor(toNumber(date));
    if (!sec) return '—';
    const d = new Date(sec * 1000);
    return d.toLocaleDateString('en-Uk');
}

function toNumber(value) {
    if (value == null) return 0;
    return Number(String(value).replace(',', '.')) || 0;
}

export { 
    getStat,
    getStatStudio
};