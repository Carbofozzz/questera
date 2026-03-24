import {
    client,
    TransactionStatus,
    contractQuests,
    getAddress
} from './core.js';

async function initMain() {
    if (!client) return;
    console.log("[Quests] Start init main")
    try {
        const game = await client.readContract({
            address: contractQuests,
            functionName: 'get_quests_date',
            args: [50],
        });
        let res = String(game);
        console.error('Success getting bradbury:', res);
    } catch (error) {
        console.error('Error getting bradbury:', error);
    }
}

async function getQuest(id) {
    
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
    });
}

function parseDateToUnixTimestamp(dateValue) {
    if (!dateValue) return 0;
    const parsedDate = new Date(`${dateValue}T00:00:00`);
    return Math.floor(parsedDate.getTime());
}

async function createQuest(title, desc, image, pool, dateValue) {
    const form = document.getElementById('questForm');
    const preview = document.getElementById('previewImg');
    const btn = document.getElementById('createBtn');
    const progress = document.getElementById('createProgress');
    if (btn) btn.classList.add('hidden');
    if (progress) progress.classList.remove('hidden');
    try {
        const date = parseDateToUnixTimestamp(dateValue);
        const creator = getAddress();
        const response = await fetch('/api/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                image,
                title,
                desc,
                creator,
                date,
                pool
            })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Quest creation failed');
        }
        console.log("[Quest] success create", result)
        if (form) form.reset();
        if (preview) preview.classList.add('hidden');
        if (preview) preview.src = '';
        if (btn) btn.classList.remove('hidden');
        if (progress) progress.classList.add('hidden');
    } catch (e) {
        console.error("[Quest] error create", e);
        if (btn) btn.classList.remove('hidden');
        if (progress) progress.classList.add('hidden');
    }
}

export { 
    initMain,
    getQuest,
    createQuest 
};