import {
    client,
    TransactionStatus,
    ExecutionResult,
    contractQuests,
    getAddress,
    escrowAbi,
    getUSDC,
    checkGenlayerBradbury,
    checkBaseSepolia,
    ethers
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
        isActiveBool: String(q.is_active).toLowerCase() === 'true',
        isCompletedBool: q.state && String(q.state.is_completed).toLowerCase() === 'true'
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
        return `
          <article class="card" data-contract="${escapeHtml(q.contract || '')}">
            <div class="card__cover-wrap">
              <img
                class="card__cover"
                data-src="${escapeHtml(q.image)}"
                src=""
                alt="${escapeHtml(q.title || 'Quest image')}"
              />
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

    const images = cardsRoot.querySelectorAll('.card__cover');
    images.forEach((img) => {
        const url = img.dataset.src || '';
        if (!url) return;
        loadWithRetry(img, url, 3, 300);
    });

    cardsRoot.onclick = (e) => {
        const btn = e.target.closest('.btn--open');
        if (!btn) return;

        const contract = btn.dataset.contract;
        if (!contract) return;

        window.location.href = `/quest/${encodeURIComponent(contract)}`;
    };
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
    if (!client) return;
    const loader = document.getElementById('questLoader');
    const content = document.getElementById('questContent');
    const contentSide = document.getElementById('questContentSide');
    const titleEl = document.getElementById('questTitle');
    const descEl = document.getElementById('questDesc');
    const poolEl = document.getElementById('questPool');
    const dateEl = document.getElementById('questDate');
    const imageEl = document.getElementById('questImage');
    const checkEl = document.getElementById('statusCheck');
    const poolTotalEl = document.getElementById('poolTotal');
    const startBtn = document.getElementById('startBtn');
    const answerBtn = document.getElementById('answerBtn');
    const startProgress = document.getElementById('startProgress');
    const narrationEl = document.getElementById('narration');
    const taskEl = document.getElementById('task');
    const commentEl = document.getElementById('comment');
    const area = document.getElementById('q-answer');
    const questImg = document.getElementById('questImg');

    const inputWrap = document.getElementById('questInputWrap');
    const submitBtn = document.getElementById('questBtns');

    const showLoading = () => {
        if (loader) loader.classList.remove('hidden');
        if (content) content.classList.add('hidden');
        if (contentSide) contentSide.classList.add('hidden');
    };

    const showContent = () => {
        if (loader) loader.classList.add('hidden');
        if (content) content.classList.remove('hidden');
        if (contentSide) contentSide.classList.remove('hidden');
    };

    showLoading();

    try {
        const logs = await client.readContract({
            address: id,
            functionName: "get_log",
            args: [],
        });
        console.log('[Quest] Success getting logs:', logs);
        const game = await client.readContract({
            address: id,
            functionName: "get_my_quest",
            args: [],
        });
        const q = normalizeQuest(JSON.parse(game));
        const nowSec = Math.floor(Date.now() / 1000);
        const isExpired = q.endSec <= nowSec;
        const isDisabled = !q.isActiveBool || isExpired;

        if (titleEl) titleEl.textContent = q.title || 'Untitled';
        if (descEl) descEl.textContent = q.desc || '';
        if (poolEl) poolEl.textContent = `${q.poolNum} USDC`;
        if (dateEl) dateEl.textContent = q.endSec ? formatDateFromSec(q.endSec) : '—';

        if (imageEl) {
            loadWithRetry(imageEl, q.image || '', 3);
            imageEl.alt = q.title || 'Quest image';
        }

        if (poolTotalEl) poolTotalEl.textContent = q.pool + ' USDC';

        if (isDisabled) {
            if (questImg) questImg.classList.remove('hidden');
            if (narrationEl) narrationEl.classList.add('hidden');
            if (taskEl) taskEl.classList.add('hidden');
            if (commentEl) commentEl.classList.add('hidden');
            if (inputWrap) inputWrap.classList.add('hidden');
            if (submitBtn) submitBtn.classList.add('hidden');
            if (checkEl) checkEl.classList.add('quest-check--past');
            if (checkEl) checkEl.classList.remove('quest-check--active');
        } else {
            const state = q.state;
            if (startProgress) startProgress.classList.add('hidden');
            if (state) {
                if (q.isCompletedBool) {
                    if (inputWrap) inputWrap.classList.add('hidden');
                    if (questImg) questImg.classList.remove('hidden');
                } else {
                    if (inputWrap) inputWrap.classList.remove('hidden');
                    if (questImg) questImg.classList.add('hidden');
                }
                if (answerBtn) answerBtn.classList.remove('hidden');
                if (startBtn) startBtn.classList.add('hidden');
                if (narrationEl) narrationEl.classList.remove('hidden');
                if (taskEl) taskEl.classList.remove('hidden');
                if (commentEl) commentEl.classList.remove('hidden');
                if (narrationEl) narrationEl.textContent = state.last_narration
                if (taskEl) taskEl.textContent = state.last_task_summary
                if (commentEl) commentEl.textContent = state.last_comment
                if (area) area.value=''; 
            } else {
                if (questImg) questImg.classList.remove('hidden');
                if (startBtn) startBtn.classList.remove('hidden');
                if (answerBtn) answerBtn.classList.add('hidden');
                if (inputWrap) inputWrap.classList.add('hidden');
                if (narrationEl) narrationEl.classList.add('hidden');
                if (taskEl) taskEl.classList.add('hidden');
                if (commentEl) commentEl.classList.add('hidden');
            }
            if (q.isCompletedBool) {
                if (submitBtn) submitBtn.classList.add('hidden');
            } else {
                if (submitBtn) submitBtn.classList.remove('hidden');
            }
            if (checkEl) checkEl.classList.remove('quest-check--past');
            if (checkEl) checkEl.classList.add('quest-check--active');
        }
        console.log('[Quest] Success getting quest:', q);
        checkEscrow(q.escrow, q.creator, isExpired);
    } catch(error) {
        console.error('[Quest] Error getting quest:', error);
    } finally {
        showContent();
    }
}

async function startQuest() {
    if (!client) return;
    const startBtn = document.getElementById('startBtn');
    const startProgress = document.getElementById('startProgress');
    if (startBtn) startBtn.classList.add('hidden');
    if (startProgress) startProgress.classList.remove('hidden');
    try {
        checkGenlayerBradbury();
        const txHash = await client.writeContract({
            address: document.body.dataset.questId,
            functionName: "start",
            args: [],
        });
        console.error('[Quest] Success tx start quest:', txHash);
        const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            status: TransactionStatus.ACCEPTED,
            retries: 200,
            interval: 5000,
        });
        console.error('[Quest] Success start quest:', receipt);
    } catch(error) {
        console.error('[Quest] Error start quest:', error);
    } finally {
        getQuest(document.body.dataset.questId);
    }
}

async function answerQuest(answer) {
    if (!client) return;
    const answerBtn = document.getElementById('answerBtn');
    const startProgress = document.getElementById('startProgress');
    if (answerBtn) answerBtn.classList.add('hidden');
    if (startProgress) startProgress.classList.remove('hidden');
    try {
        checkGenlayerBradbury();
        const txHash = await client.writeContract({
            address: document.body.dataset.questId,
            functionName: "answer",
            args: [answer],
        });
        console.error('[Quest] Success tx answer quest:', txHash);
        const receipt = await client.waitForTransactionReceipt({
            hash: txHash,
            status: TransactionStatus.ACCEPTED,
            retries: 200,
            interval: 5000,
        });
        if (receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN) {
            // Execution succeeded — safe to read state
                
        } else if (receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) {
            // Execution failed — contract state was not modified
            console.error("[Quest] Contract execution failed");
        } else {
            // NOT_VOTED — execution hasn't completed
            console.warn("[Quest] Execution result not yet available");
        }
        console.log('[Quest] Success answer quest:', receipt.txExecutionResultName);
    } catch(error) {
        console.error('[Quest] Error answer quest:', error);
    } finally {
        getQuest(document.body.dataset.questId);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkEscrow(escrow, creator, isExpired) {
    const participantsEl = document.getElementById('playerTotal');
    const poolCommentEl = document.getElementById('poolComment');
    const rewardEl = document.getElementById('playerReward');
    renderPoolAction();
    try {
        await checkBaseSepolia();
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const userAddress = await signer.getAddress();
        const gameContract = new ethers.Contract(escrow, escrowAbi, signer);
        const reward = await gameContract.claimableAmount(userAddress);
        console.log("[Quest] User reward:", reward.toString());
        const participants = await gameContract.winnersCount();
        console.log("[Quest] User participants:", participants.toString());
        const funded = await gameContract.funded();
        console.log("[Quest] Pool funded:", funded.toString());
        const refunded = await gameContract.refunded();
        console.log("[Quest] Pool refunded:", refunded.toString());
        const rewards = await gameContract.claimableAmount(getAddress());
        console.log("[Quest] User reward:", rewards.toString());
        if (participantsEl) participantsEl.textContent = participants.toString();
        const hasReward = reward.gt(0);
        const owner = ethers.utils.getAddress(creator) === ethers.utils.getAddress(getAddress());
        console.log("[Quest] Is contract owner:", owner.toString());
        const usdc = await getUSDC();
        const decimals = await usdc.decimals();
        if (hasReward) {
            const rewardFormatted = formatRewardAmount(reward, decimals);
            if (rewardEl) rewardEl.textContent = `${rewardFormatted} USDC`;
        } else {
            if (rewardEl) rewardEl.textContent = '0 USDC';
        }
        if (!funded && !isExpired) {
            if (owner) {
                renderPoolAction({
                    text: 'Fund',
                    onClick: async () => {
                        await fundEscrow(gameContract, escrow);
                        await sleep(1000);
                        await checkEscrow(escrow, creator, isExpired);
                    },
                    loadingText: 'Funding...'
                });
            }
            if (poolCommentEl) poolCommentEl.textContent = 'Deposit of funds is pending';
        } else if (!funded) {
            if (poolCommentEl) poolCommentEl.textContent = 'The deposit period has expired';
        } else if (!isExpired) {
            if (poolCommentEl) poolCommentEl.textContent = 'The funds have been reserved';
        } else {
            if (participants == 0) {
                if (poolCommentEl) poolCommentEl.textContent = 'Available for refund';
                if (!refunded && owner) {
                    renderPoolAction({
                        text: 'Refund',
                        onClick: async () => {
                            await refundEscrow(gameContract);
                            await checkEscrow(escrow, creator, isExpired);
                        },
                        loadingText: 'Refunding...'
                    });
                }
            } else {
                if (poolCommentEl) poolCommentEl.textContent = 'Available for rewards claiming';
                if (hasReward) {
                    renderPoolAction({
                        text: 'Claim',
                        onClick: async () => {
                            const tx = await gameContract.claimWinner();
                            await tx.wait();
                            await sleep(1000);
                            await checkEscrow(escrow, creator, isExpired);
                        },
                        loadingText: 'Claiming...'
                    });
                }
            }
        }

    } catch (error) {
        console.error('[Quest] Error in check escrow:', error);
    }
}

function formatRewardAmount(value, decimals = 6) {
    const num = Number(
        ethers.utils.formatUnits(value, decimals)
    );
    if (!Number.isFinite(num)) return '0';
    if (Number.isInteger(num)) return String(num);
    if (num < 1) {
        return num.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 6,
            useGrouping: false
        });
    }
    return num.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
        useGrouping: false
    });
}

function renderPoolAction({ text, onClick, loadingText = 'Processing...' } = {}) {
    let root = document.getElementById('poolAction');
    if (text === 'Claim') {
        root = document.getElementById('playerAction');
    }
    if (!root) return;
    root.classList.add('hidden');
    root.innerHTML = '';
    if (!text || typeof onClick !== 'function') return;
    root.classList.remove('hidden');
    const btn = document.createElement('button');
    btn.className = 'btn btn--open';
    btn.type = 'button';
    btn.textContent = text;

    btn.addEventListener('click', async () => {
        const prev = btn.textContent;
        btn.disabled = true;
        btn.textContent = loadingText;
        try {
            await onClick();
        } catch (e) {
            console.error(`[Quest] ${text} failed:`, e);
        } finally {
            btn.disabled = false;
            btn.textContent = prev;
        }
    });

    root.appendChild(btn);
}

async function fundEscrow(gameContract, escrow) {
    const usdc = await getUSDC();
    const signerAddress = getAddress();

    const amount = await gameContract.poolAmount(); 
    console.log("[Quest] Pool amount:", amount.toString());
    const allowance = await usdc.allowance(signerAddress, escrow);
    if (allowance.lt(amount)) {
        const txApprove = await usdc.approve(escrow, amount);
        await txApprove.wait();
        await sleep(1000);
    }

    const tx = await gameContract.fund();
    await tx.wait();
}

async function refundEscrow(gameContract) {
    //const tx = await gameContract.endDate();
    //console.log("time", tx.toString());
    const tx = await gameContract.claimRefund();
    await tx.wait();
}

function loadWithRetry(imageEl, url, maxRetries = 3, delay = 300) {
    let attempt = 0;
  
    const tryLoad = () => {
      const bust = `retry=${attempt}&t=${Date.now()}`;
      const sep = url.includes('?') ? '&' : '?';
      imageEl.src = `${url}${sep}${bust}`;
    };
  
    imageEl.onload = () => {
      console.log('[Quest] Image loaded');
    };
  
    imageEl.onerror = () => {
      attempt++;
      if (attempt <= maxRetries) {
        console.warn(`retry ${attempt}/${maxRetries}`);
        setTimeout(tryLoad, delay * attempt);
        console.error('[Quest] Failed to load image');
        imageEl.src = '';
      }
    };
  
    tryLoad();
  }

function parseDateToUnixTimestamp(dateValue) {
    if (!dateValue) return 0;
    const parsedDate = new Date(`${dateValue}T00:00:00Z`);
    return Math.floor(parsedDate.getTime());
}

async function createQuest(title, desc, prompt, image, pool, dateValue) {
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
                prompt,
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
        window.location.href = `/quest/${encodeURIComponent(result.quest)}`;
    } catch (e) {
        console.error("[Quest] error create", e);
        if (btn) btn.classList.remove('hidden');
        if (progress) progress.classList.add('hidden');
    }
}

export { 
    initMain,
    getQuest,
    createQuest,
    startQuest,
    answerQuest
};