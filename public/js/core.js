import { createClient } from "https://esm.sh/genlayer-js";
import { testnetBradbury } from "https://esm.sh/genlayer-js/chains";
import { TransactionStatus, ExecutionResult } from "https://esm.sh/genlayer-js/types";
import { ethers } from "https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.esm.min.js";

let client = null;
let inited = false;

let contractQuests = '0x6D704a7e3a6606C86B5d0804CcEC17d14b79c72A';

const BASE_SEPOLIA_RPC = "https://sepolia.base.org";
const BASE_SEPOLIA_USDC= "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const erc20Abi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)"
];

const escrowAbi = [
    "function fund()",
    "function claimWinner()",
    "function claimRefund()",
    "function claimableAmount(address user) external view returns (uint256)",
    "function winnersCount() external view returns (uint256)",
    "function poolAmount() external view returns (uint256)",
    "function endDate() external view returns (uint256)",
    "function funded() external view returns (bool)",
    "function refunded() external view returns (bool)"
];

function maskAddress(a){ if(!a) return ''; return a.slice(0,5)+'…'+a.slice(-4); }

function fmt(t){
    const m = Math.floor((t%3600)/60);
    const s = Math.floor(t%60);
    const h = Math.floor(t/3600);
    return (h>0?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

async function getUSDCBalance() {
    return getErc20Balance(BASE_SEPOLIA_USDC, BASE_SEPOLIA_RPC);
}

async function getErc20Balance(tokenAddress, rpc) {
    const provider = new ethers.providers.JsonRpcProvider(rpc);
    const token = new ethers.Contract(tokenAddress, erc20Abi, provider);

    const [rawBalance, decimals, symbol] = await Promise.all([
        token.balanceOf(getAddress()),
        token.decimals(),
        token.symbol()
    ]);
    const base = ethers.BigNumber.from(10).pow(decimals);
    const wholeBn = rawBalance.div(base);
    const whole = wholeBn.toString();
    const hasWhole = wholeBn.gte(1);
    return { whole, symbol, hasWhole };
}

async function getUSDC() {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const usdc = new ethers.Contract(BASE_SEPOLIA_USDC, erc20Abi, signer);
    return usdc;
}

function updateAccount(account) {
    try {
        if (!account) {
            client = null;
            return;
        }
        client = createClient({ chain: testnetBradbury, account });
        queueMicrotask(() => checkPage());
        console.error('Success update account', account);
    } catch (error) {
        console.error('Error update account', error);
    }
}

async function connectWalletAndEnsureNetwork(){
    const net = await (await fetch('/api/config/network_bradbury')).json();
    if (!window.ethereum) throw new Error('No wallet');
    try { 
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: net.chainIdHex }] });
    } catch (e) {
        if (e.code===4902 || (e.data && e.data.originalError && e.data.originalError.code===4902)) {
            await window.ethereum.request({ method:'wallet_addEthereumChain', params:[{ chainId: net.chainIdHex, chainName: net.chainName, rpcUrls: net.rpcUrls, nativeCurrency: net.nativeCurrency, blockExplorerUrls: net.blockExplorerUrls }] });
        } else { throw e; }
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    return accounts[0];
}

function setUIConnected(address) {
    const addr = document.getElementById('addr'); if (addr) addr.textContent = maskAddress(address);
    const btn = document.getElementById('connectBtn'); if (btn) { btn.textContent = 'Disconnect'; btn.dataset.state = 'connected'; }
    const cards = document.getElementById('sectionCards'); if (cards) { cards.innerHTML = ''; }
    setSectionsLocked(false);
}

function setUIDisconnected() {
    const addr = document.getElementById('addr'); if (addr) addr.textContent = '';
    const btn = document.getElementById('connectBtn'); if (btn) { btn.textContent = 'Connect wallet'; btn.dataset.state = 'disconnected'; }
    const cards = document.getElementById('sectionCards'); if (cards) { 
        cards.innerHTML = `
        <article class="card">
          <div class="card__cover-wrap">
            <img
              class="card__cover"
              src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1000&q=80"
              alt="Social Media Engagement"
            />
          </div>

          <h3 class="card__title">Social Media Engagement</h3>
          <p class="card__desc">Complete social tasks and get verified reward payouts.</p>

          <div class="card__meta">
            <span class="price"><span class="price__icon">$</span> 50 USDC</span>
            <span class="stars">★ ★ ☆</span>
          </div>

          <button class="btn btn--open">Open Quest</button>
        </article>

        <article class="card">
          <div class="card__cover-wrap">
            <img
              class="card__cover"
              src="https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1000&q=80"
              alt="Product Feedback Survey"
            />
          </div>

          <h3 class="card__title">Product Feedback Survey</h3>
          <p class="card__desc">Share your feedback and receive escrow-protected payments.</p>

          <div class="card__meta">
            <span class="price"><span class="price__icon">$</span> 25 USDC</span>
            <span class="stars">★ ★ ☆</span>
          </div>

          <button class="btn btn--open">Open Quest</button>
        </article>

        <article class="card">
          <div class="card__cover-wrap">
            <img
              class="card__cover"
              src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1000&q=80"
              alt="Content Creation Challenge"
            />
          </div>

          <h3 class="card__title">Content Creation Challenge</h3>
          <p class="card__desc">Create branded content and get instant payout after review.</p>

          <div class="card__meta">
            <span class="price"><span class="price__icon">$</span> 75 USDC</span>
            <span class="stars">★ ★ ☆</span>
          </div>

          <button class="btn btn--open">Open Quest</button>
        </article>
        `; 
    }
    setSectionsLocked(true);
}

function setSectionsLocked(locked) {
    const ids = ['sectionToolbar', 'sectionCards'];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.toggle('is-locked', locked);
        el.setAttribute('aria-disabled', locked ? 'true' : 'false');
    });
}

async function disconnect() {
    try {
        localStorage.removeItem('connectedAddress');
        setUIDisconnected();
    } catch (e) {
        console.error('Disconnect error', e);
    }
}

async function connect() {
    const address = await connectWalletAndEnsureNetwork();
    localStorage.setItem('connectedAddress', address);
    setUIConnected(address);
    updateAccount(address);
    return address;
}

async function checkGenlayerBradbury() {
    const net = await (await fetch('/api/config/network_bradbury')).json();
    checkNet(net)
}

async function checkBaseSepolia() {
    const net = await (await fetch('/api/config/network_base_sepolia')).json();
    checkNet(net)
}


async function checkNet(net) {
    if (!window.ethereum) throw new Error('No wallet');
    try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: net.chainIdHex }] });
    } catch (e) {
        if (e.code===4902 || (e.data && e.data.originalError && e.data.originalError.code===4902)) {
            await window.ethereum.request({ method:'wallet_addEthereumChain', params:[{ chainId: net.chainIdHex, chainName: net.chainName, rpcUrls: net.rpcUrls, nativeCurrency: net.nativeCurrency, blockExplorerUrls: net.blockExplorerUrls }] });
        } else { throw e; }
    }
}

let _checkPageImpl = () => {};
function setCheckPageImpl(fn) { _checkPageImpl = fn; }
function checkPage(){ _checkPageImpl(); }

function init() {
    if (inited) {
        return;
    }
    inited = true;
    const btn = document.getElementById('connectBtn');
    if (btn) {
        btn.dataset.state = 'disconnected';
        btn.addEventListener('click', async () => {
            try {
                if (btn.dataset.state === 'connected') { await disconnect(); }
                else { await connect(); }
            } catch (e) { 
                alert(e.message || String(e));
            }
        });
    }
    const saved = localStorage.getItem('connectedAddress');
    if (saved) {
        setUIConnected(saved);
        queueMicrotask(() => updateAccount(saved));
    } else {
        setUIDisconnected();
    }
}

function isConnected(){ return !!localStorage.getItem('connectedAddress'); }

function getAddress(){ return localStorage.getItem('connectedAddress') || ''; }

async function ensureConnected(){
    if (!isConnected()) throw new Error('Please connect your wallet first');
    return getAddress();
}

function requireConnectedOnLoad(){
    if (!isConnected()) {
      console.warn('Wallet not connected. Please connect your wallet first.');
    }
}

export {
    client,
    TransactionStatus,
    ExecutionResult,
    contractQuests,
    maskAddress,
    getAddress,
    isConnected,
    ensureConnected,
    connect,
    disconnect,
    connectWalletAndEnsureNetwork,
    updateAccount,
    init,
    checkPage,
    setCheckPageImpl,
    fmt,
    checkGenlayerBradbury,
    checkBaseSepolia,
    getUSDCBalance,
    getUSDC,
    escrowAbi,
    ethers
};