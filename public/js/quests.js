import {
    client,
    TransactionStatus,
    contractQuests,
    getAddress
} from './core.js';

let mainState = {
    sort: 'reward',
    tab: 'active',
    quests: []
};

async function loadQuests(sortType = 'reward') {
    if (!client) return [];
    const fn = sortType === 'date' ? 'get_quests_date' : 'get_quests_pool';

    const game = await client.readContract({
        address: contractQuests,
        functionName: fn,
        args: [50],
    });

    const parsed = JSON.parse(game);
    return Array.isArray(parsed) ? parsed : [];
}

function toNumber(value) {
    if (value == null) return 0;
    return Number(String(value).replace(',', '.')) || 0;
}

function normalizeQuest(q) {
    const endSec = Math.floor(toNumber(q.end_date));
    return {
        ...q,
        endSec,
        poolNum: toNumber(q.pool),
        isActiveBool: String(q.is_active).toLowerCase() === 'true'
    };
}

function filterByTab(quests, tab) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (tab === 'active') {
        return quests.filter(q => q.endSec > nowSec);
    }
    return quests.filter(q => q.endSec <= nowSec);
}

function escapeHtml(str = '') {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatDateFromSec(sec) {
    if (!sec) return '—';
    const d = new Date(sec * 1000);
    return d.toLocaleDateString('en-Uk');
}

function renderCards(quests) {
    const cardsRoot = document.querySelector('.cards');
    if (!cardsRoot) return;

    if (!quests.length) {
        cardsRoot.innerHTML = `<p class="empty">No quests found</p>`;
        return;
    }

    cardsRoot.innerHTML = quests.map(q => {
        const isActive = q.endSec > Math.floor(Date.now() / 1000);
        const statusClass = isActive ? 'status--active' : 'status--past';
        const statusText = isActive ? '✓' : '✓';

        return `
          <article class="card" data-contract="${escapeHtml(q.contract || '')}">
            <div class="card__cover-wrap">
              <img
                class="card__cover"
                src="${escapeHtml(q.image || '')}"
                alt="${escapeHtml(q.title || 'Quest image')}"
              />
              <span class="status ${statusClass}">${statusText}</span>
            </div>

            <h3 class="card__title">${escapeHtml(q.title || 'Untitled')}</h3>
            <p class="card__desc">${escapeHtml(q.desc || '')}</p>

            <div class="card__meta">
              <span class="price"><span class="price__icon">$</span> ${q.poolNum} USDC</span>
              <span class="date">ends ${formatDateFromSec(q.endSec)}</span>
            </div>

            <button class="btn btn--open" data-contract="${escapeHtml(q.contract || '')}">Open Quest</button>
          </article>
        `;
    }).join('');
}

function setActiveTabUI(tab) {
    const activeBtn = document.getElementById('activeBtn');
    const pastBtn = document.getElementById('pastBtn');
    if (!activeBtn || !pastBtn) return;

    const isActiveTab = tab === 'active';

    activeBtn.classList.toggle('tab--active', isActiveTab);
    pastBtn.classList.toggle('tab--active', !isActiveTab);

    activeBtn.setAttribute('aria-selected', isActiveTab ? 'true' : 'false');
    pastBtn.setAttribute('aria-selected', isActiveTab ? 'false' : 'true');
}

async function redrawMain() {
    const filtered = filterByTab(mainState.quests, mainState.tab);
    renderCards(filtered);
    setActiveTabUI(mainState.tab);
}

async function initMain() {
    if (!client) return;
    console.log("[Quests] Start init main");

    const activeBtn = document.getElementById('activeBtn');
    const pastBtn = document.getElementById('pastBtn');
    const sortSelect = document.getElementById('sort-select');

    if (sortSelect) {
        const value = (sortSelect.value || '').toLowerCase();
        mainState.sort = value === 'date' ? 'date' : 'reward';
    }

    try {
        mainState.quests = (await loadQuests(mainState.sort)).map(normalizeQuest);
        await redrawMain();
        console.log('[Quests] Success getting quests:', mainState.quests);
    } catch (error) {
        console.error('[Quests] Error getting quests:', error);
        renderCards([]);
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', async (e) => {
            const value = (e.target.value || '').toLowerCase();
            mainState.sort = value === 'date' ? 'date' : 'reward';

            try {
                mainState.quests = (await loadQuests(mainState.sort)).map(normalizeQuest);
                await redrawMain();
            } catch (error) {
                console.error('[Quests] Error getting quests on sort change:', error);
            }
        });
    }

    if (activeBtn) {
        activeBtn.addEventListener('click', async () => {
            mainState.tab = 'active';
            await redrawMain();
        });
    }

    if (pastBtn) {
        pastBtn.addEventListener('click', async () => {
            mainState.tab = 'past';
            await redrawMain();
        });
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