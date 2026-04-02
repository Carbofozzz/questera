import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import AWS from 'aws-sdk';
import { 
  bradburyNetwork, 
  studionetNetwork,
  baseSepoliaNetwork, 
  getPrivateKey, 
  getBaseRpcUrl, 
  getBaseBridgeIn, 
  getBaseBridgeOut,
  getBaseBridgeOutStudioNet,
  getBaseUSDC,
  getBradburyBridgeIn,
  getBradburyBridgeOut,
  getStudioNetBridgeIn,
  getStudioNetBridgeOut,
  getBradburyQuests,
  getStudioNetQuests,
  getRelayer
} from './config/network.js';
import sharp from 'sharp';
import { ethers } from "ethers";
import { readFileSync } from 'fs';
import { createAccount, createClient } from "genlayer-js";
import { testnetBradbury, studionet } from "genlayer-js/chains";
import { TransactionStatus } from 'genlayer-js/types';
import EscrowArtifact from '../contracts/artifacts/escrow.json' with { type: 'json' };

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const PORT = process.env.PORT || 3000;
const S3_ENDPOINT = process.env.S3_ENDPOINT || "";
const S3_BUCKET = process.env.S3_BUCKET || "";
const S3_KEY = process.env.S3_KEY || "";
const S3_SECRET = process.env.S3_SECRET || "";

const s3 = new AWS.S3({
  endpoint: S3_ENDPOINT,
  accessKeyId: S3_KEY,
  secretAccessKey: S3_SECRET,
  s3ForcePathStyle: true,
  signatureVersion: 'v4'
});

const privateKey = getPrivateKey();

// initialize base client
const baseProvider = new ethers.JsonRpcProvider(getBaseRpcUrl());
const baseWallet = new ethers.Wallet(getPrivateKey(), baseProvider);
const escrowFactory = new ethers.ContractFactory(
  EscrowArtifact.abi,
  EscrowArtifact.bytecode,
  baseWallet
);
const escrowAbi = [
  "function setIcContract(address _icContract)"
];

// initialize GenLayer client
const account = createAccount(`0x${privateKey.replace(/^0x/, "")}`);
const genLayerClient = createClient({
  chain: testnetBradbury,
  account,
});
const genLayerClientStudioNet = createClient({
  chain: studionet,
  account,
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.static(path.join(__dirname, '../public')));

// health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// network configs
app.get('/api/config/network_bradbury', (_req, res) => {
  return res.json(bradburyNetwork);
});

app.get('/api/config/network_studionet', (_req, res) => {
  return res.json(studionetNetwork);
});

app.get('/api/config/network_base_sepolia', (_req, res) => {
  return res.json(baseSepoliaNetwork);
});

// dynamic page routes
app.get('/quest/:id', async (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(getQuestPage(req));
  } catch(e) {
    return res.status(500).send('Failed to load quest', e);
  }
});

app.get('/quest-studio/:id', async (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(getQuestPageStudioNet(req));
  } catch(e) {
    return res.status(500).send('Failed to load quest', e);
  }
});
// static pages routes
app.get('/faq', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/faq.html'));
});

app.get('/faq-studio', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/faq-studio.html'));
});

app.get('/me', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/me.html'));
});

app.get('/me-studio', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/me-studio.html'));
});

app.get('/create', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/create.html'));
});

app.get('/create-studio', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/create-studio.html'));
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/studio', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/studio.html'));
});

// api
app.post('/api/create', async (req, res) => {
  try {
    const { image, title, desc, prompt, creator, date, pool } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Invalid title' });
    }
    if (typeof desc !== 'string' || !desc.trim()) {
      return res.status(400).json({ error: 'Invalid description' });
    }
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Invalid prompt' });
    }
    if (typeof creator !== 'string' || !creator.trim()) {
      return res.status(400).json({ error: 'Invalid creator' });
    }
    const rewardPool = Number(pool);
    if (!Number.isFinite(rewardPool) || rewardPool <= 0) {
      return res.status(400).json({ error: 'Invalid reward pool' });
    }
    const expirationTimestamp = Number(date);
    if (!Number.isFinite(expirationTimestamp) || expirationTimestamp <= 0) {
      return res.status(400).json({ error: 'Invalid expiration date' });
    }
    if (typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image' });
    }
    const [meta, base64] = image.split(',');
    const mimeType = meta.substring(meta.indexOf(':') + 1, meta.indexOf(';'));
    const buffer = Buffer.from(base64, 'base64');

    const processedBuffer = await sharp(buffer)
      .resize({
        width: 700,
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 70,
        progressive: true,
      })
      .toBuffer();

    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const ext = 'jpg';
    const filename = `quest_${id}.${ext}`;
    const s3Key = `questera/${filename}`;

    const params = {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: processedBuffer,
      ContentType: mimeType,
      ACL: 'public-read'
    };
    const s3UploadResult = await s3.upload(params).promise();
    const s3Url = s3UploadResult.Location;

    // deploy escrow
    const expirationTimestampSec = expirationTimestamp / 1000;
    const escrowContract = await escrowFactory.deploy(creator, getBaseUSDC(), getBaseBridgeIn(), getBaseBridgeOut(), rewardPool, expirationTimestampSec);
    await escrowContract.waitForDeployment();
    const escrowAddress = await escrowContract.getAddress();
    console.log('Escrow deployed on Base:', escrowAddress);
    // deploy quest
    const quest = await deployContract(
      getRelayer(), 
      getBradburyQuests(), 
      getBradburyBridgeIn(), 
      getBradburyBridgeOut(), 
      creator, 
      escrowAddress, 
      title.trim(), 
      desc.trim(), 
      s3Url, 
      prompt.trim(), 
      expirationTimestamp, 
      rewardPool
    );
    console.log('Quest deployed on Bradbury:', quest);
    
    if (quest) {
      // add quest to escrow
      const contractWrite = new ethers.Contract(escrowAddress, escrowAbi, baseWallet);
      const tx = await contractWrite.setIcContract(quest);
      await tx.wait();
      console.log("Escrow updated:", tx.hash);
      // add quest to bd
      const transactionHash = await genLayerClient.writeContract({
        address: getBradburyQuests(),
        functionName: 'add_quest_creator',
        args: [creator.trim(), quest, title.trim(), expirationTimestamp], 
      });
      console.log("Add quest tx on Bradbury", transactionHash);
      const receiptB = await genLayerClient.waitForTransactionReceipt({
        hash: transactionHash,
        status: TransactionStatus.ACCEPTED,
        retries: 200,
        interval: 5000,
      });
    
      console.log('Quest added on Bradbury:', receiptB);

      return res.json({
        id,
        url: s3Url,
        quest: quest,
        escrow: escrowAddress
      });
    } else {
      return res.status(400).json({ error: 'Error adding a quest' });
    }
    
  } catch (e) {
    console.error('Error creating a quest:', e);
    return res.status(500).json({ error: 'Error creating a quest' });
  }
});

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
} 

app.post('/api/create-studio', async (req, res) => {
  try {
    const { image, title, desc, prompt, creator, date, pool } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Invalid title' });
    }
    if (typeof desc !== 'string' || !desc.trim()) {
      return res.status(400).json({ error: 'Invalid description' });
    }
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Invalid prompt' });
    }
    if (typeof creator !== 'string' || !creator.trim()) {
      return res.status(400).json({ error: 'Invalid creator' });
    }
    const rewardPool = Number(pool);
    if (!Number.isFinite(rewardPool) || rewardPool <= 0) {
      return res.status(400).json({ error: 'Invalid reward pool' });
    }
    const expirationTimestamp = Number(date);
    if (!Number.isFinite(expirationTimestamp) || expirationTimestamp <= 0) {
      return res.status(400).json({ error: 'Invalid expiration date' });
    }
    if (typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image' });
    }
    const [meta, base64] = image.split(',');
    const mimeType = meta.substring(meta.indexOf(':') + 1, meta.indexOf(';'));
    const buffer = Buffer.from(base64, 'base64');

    const processedBuffer = await sharp(buffer)
      .resize({
        width: 700,
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 70,
        progressive: true,
      })
      .toBuffer();

    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const ext = 'jpg';
    const filename = `quest_${id}.${ext}`;
    const s3Key = `questera/${filename}`;

    const params = {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: processedBuffer,
      ContentType: mimeType,
      ACL: 'public-read'
    };
    const s3UploadResult = await s3.upload(params).promise();
    const s3Url = s3UploadResult.Location;

    // deploy escrow
    const expirationTimestampSec = expirationTimestamp / 1000;
    const escrowContract = await escrowFactory.deploy(creator, getBaseUSDC(), getBaseBridgeIn(), getBaseBridgeOutStudioNet(), rewardPool, expirationTimestampSec);
    await escrowContract.waitForDeployment();
    const escrowAddress = await escrowContract.getAddress();
    console.log('Escrow deployed on Base:', escrowAddress);
    // deploy quest
    const quest = await deployContractStudioNet(
      getRelayer(), 
      getStudioNetQuests(), 
      getStudioNetBridgeIn(), 
      getStudioNetBridgeOut(), 
      creator, 
      escrowAddress, 
      title.trim(), 
      desc.trim(), 
      s3Url, 
      prompt.trim(), 
      expirationTimestamp, 
      rewardPool
    );
    console.log('Quest deployed on StudioNet:', quest);
    
    if (quest) {
      // add quest to escrow
      const contractWrite = new ethers.Contract(escrowAddress, escrowAbi, baseWallet);
      const tx = await contractWrite.setIcContract(quest);
      await tx.wait();
      console.log("Escrow updated:", tx.hash);
      // add quest to bd
      const transactionHash = await genLayerClientStudioNet.writeContract({
        address: getStudioNetQuests(),
        functionName: 'add_quest_creator',
        args: [creator.trim(), quest, title.trim(), expirationTimestamp], 
      });
      console.log("Add quest tx on StudioNet", transactionHash);
      const receiptB = await genLayerClientStudioNet.waitForTransactionReceipt({
        hash: transactionHash,
        status: TransactionStatus.ACCEPTED,
        retries: 200,
        interval: 5000,
      });
    
      console.log('Quest added on StudioNet:', receiptB);

      return res.json({
        id,
        url: s3Url,
        quest: quest,
        escrow: escrowAddress
      });
    } else {
      return res.status(400).json({ error: 'Error adding a quest' });
    }
    
  } catch (e) {
    console.error('Error creating a quest:', e);
    return res.status(500).json({ error: 'Error creating a quest' });
  }
});

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
} 

export default app;

function getQuestPage(req) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Questera — Quest Details</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
    rel="stylesheet"
  />
  <link rel="stylesheet" href="/css/styles.css" />
</head>
<body data-page-name="quest" data-quest-id="${req.params.id}">
  <header class="header">
    <div class="container header__row">
      <a href="/" class="logo" aria-label="Questera">
        <img src="/img/logo.png" alt="Questera" />
      </a>

      <input id="nav-toggle" class="nav-toggle" type="checkbox" aria-label="Open menu" />
      <label for="nav-toggle" class="burger" aria-hidden="true">
        <span></span><span></span><span></span>
      </label>

      <nav class="nav" aria-label="Основное меню">
          <a href="/" class="nav__link">Home</a>
        <a href="/create" class="nav__link">Create Quest</a>
        <a href="/me" class="nav__link">Portfolio</a>
        <a href="/faq" class="nav__link">How It Works</a>
      </nav>

      <button id="connectBtn" class="btn btn--wallet">Connect Wallet</button>
    </div>
  </header>

  <main class="main">
    <div class="container">
      <section class="quest-page" aria-label="Quest details">
        <div id="questLoader" class="quest-loader">
          <div class="quest-loader__bar"></div>
          <p>Loading quest...</p>
        </div>

          <article id="questContent" class="quest-main card hidden">
            <div class="quest-main__top">
              <div>
                <h1 id="questTitle" class="quest-main__title">Loading...</h1>
                <p class="quest-main__date">Expiration: <span id="questDate">—</span></p>
              </div>
              <span id="statusCheck" class="quest-check" aria-label="Quest active">✓</span>
            </div>

            <div id="questImg" class="quest-hero">
              <img id="questImage" src="" alt="Quest image" class="quest-hero__img" />
            </div>

            <p id="questDesc" class="quest-main__desc"></p>

            <div id="questInputWrap" class="quest-input-wrap">
              <p id="narration" class="hidden" style="font-style: italic;"></p>
              <h3 id="task" class="hidden"></h3>
              <textarea
                id="q-answer"
                class="quest-input"
                placeholder="Write your answer..."
                aria-label="Quest input"
              ></textarea>
              <button id="clearInput" class="quest-input__clear" aria-label="Clear">×</button>
            </div>
            <div id="questBtns" class="form-actions">
              <button id="startBtn" class="btn btn--open">Start quest</button>
              <button id="answerBtn" class="btn btn--open">Answer quest</button>
              <div id="startProgress" class="spinner hidden" aria-label="Loading"></div>
            </div>
            <p id="comment" class="hidden" style="font-size: 13px; color:#6b7280; margin-top:2em"></p>
          </article>

          <aside id="questContentSide" class="quest-side card hidden" aria-label="Quest stats">
            <h2 class="quest-side__title">Prize Pool</h2>

            <div class="quest-side__amount">
              <div>
                <div id="poolTotal" class="quest-side__value">0 USDC</div>
                <div id="poolComment" class="quest-side__sub"></div>
                <div id="poolAction" class="quest-side__action hidden"></div>
              </div>
            </div>

            <div class="quest-side__row">
              <div>
                <div id="playerTotal" class="quest-side__label">0</div>
                <div class="quest-side__sub">Winner(s)</div>
              </div>
            </div>

            <ul class="quest-steps">
              <li class="quest-steps__item">
                <span class="quest-steps__dot quest-steps__dot--violet"></span>
                <div>
                  <div class="quest-steps__name">Your reward</div>
                  <div id="playerReward" class="quest-steps__meta">0 USDC</div>
                  <div id="playerAction" class="quest-side__action hidden"></div>
                </div>
              </li>
            </ul>
          </aside>
      </section>
    </div>
  </main>

  <footer class="footer">
    <div class="container footer__row">
      <p>© 2026 Questera. All rights reserved.</p>
      <p>Questera — quest platform with escrow payouts powered by GenLayer.</p>
    </div>
  </footer>
  <script type="module" src="/js/main.js"></script>
  <script>
    const area = document.getElementById('q-answer');
    const clearBtn = document.getElementById('clearInput');
    const startBtn = document.getElementById('startBtn');
    const answerBtn = document.getElementById('answerBtn');
    if (clearBtn) clearBtn.addEventListener('click', () => { if (area) area.value=''; });
    if (startBtn) startBtn.addEventListener('click', async () => {
        try {
          if (!WalletUI.isConnected()) throw new Error('Please connect your wallet first');
        } catch (e) { alert(e.message); return; }
        try {
          WalletUI.startQuest();
        } catch(e) { alert(e.message); }
    });
    if (answerBtn) answerBtn.addEventListener('click', async () => {
        try {
          if (!WalletUI.isConnected()) throw new Error('Please connect your wallet first');
        } catch (e) { alert(e.message); return; }
        try {
          const value = (area && area.value || '').trim();
          if (!value) { alert('Please enter your answer'); return; }
          WalletUI.answerQuest(value);
        } catch(e) { alert(e.message); }
    });
  </script>
</body>
</html>
`
}

function getQuestPageStudioNet(req) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Questera — Quest Details</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
    rel="stylesheet"
  />
  <link rel="stylesheet" href="/css/styles.css" />
</head>
<body data-page-name="quest-studio" data-quest-id="${req.params.id}">
  <header class="header">
    <div class="container header__row">
      <a href="/studio" class="logo" aria-label="Questera">
        <img src="/img/logo.png" alt="Questera" />
      </a>

      <input id="nav-toggle" class="nav-toggle" type="checkbox" aria-label="Open menu" />
      <label for="nav-toggle" class="burger" aria-hidden="true">
        <span></span><span></span><span></span>
      </label>

      <nav class="nav" aria-label="Основное меню">
        <a href="/studio" class="nav__link">Home</a>
        <a href="/create-studio" class="nav__link">Create Quest</a>
        <a href="/me-studio" class="nav__link">Portfolio</a>
        <a href="/faq-studio" class="nav__link">How It Works</a>
      </nav>

      <button id="connectBtn" class="btn btn--wallet">Connect Wallet</button>
    </div>
  </header>

  <main class="main">
    <div class="container">
      <section class="quest-page" aria-label="Quest details">
        <div id="questLoader" class="quest-loader">
          <div class="quest-loader__bar"></div>
          <p>Loading quest...</p>
        </div>

          <article id="questContent" class="quest-main card hidden">
            <div class="quest-main__top">
              <div>
                <p>StudioNet</p>
                <h1 id="questTitle" class="quest-main__title">Loading...</h1>
                <p class="quest-main__date">Expiration: <span id="questDate">—</span></p>
              </div>
              <span id="statusCheck" class="quest-check" aria-label="Quest active">✓</span>
            </div>

            <div id="questImg" class="quest-hero">
              <img id="questImage" src="" alt="Quest image" class="quest-hero__img" />
            </div>

            <p id="questDesc" class="quest-main__desc"></p>

            <div id="questInputWrap" class="quest-input-wrap">
              <p id="narration" class="hidden" style="font-style: italic;"></p>
              <h3 id="task" class="hidden"></h3>
              <textarea
                id="q-answer"
                class="quest-input"
                placeholder="Write your answer..."
                aria-label="Quest input"
              ></textarea>
              <button id="clearInput" class="quest-input__clear" aria-label="Clear">×</button>
            </div>
            <div id="questBtns" class="form-actions">
              <button id="startBtn" class="btn btn--open">Start quest</button>
              <button id="answerBtn" class="btn btn--open">Answer quest</button>
              <div id="startProgress" class="spinner hidden" aria-label="Loading"></div>
            </div>
            <p id="comment" class="hidden" style="font-size: 13px; color:#6b7280; margin-top:2em"></p>
          </article>

          <aside id="questContentSide" class="quest-side card hidden" aria-label="Quest stats">
            <h2 class="quest-side__title">Prize Pool</h2>

            <div class="quest-side__amount">
              <div>
                <div id="poolTotal" class="quest-side__value">0 USDC</div>
                <div id="poolComment" class="quest-side__sub"></div>
                <div id="poolAction" class="quest-side__action hidden"></div>
              </div>
            </div>

            <div class="quest-side__row">
              <div>
                <div id="playerTotal" class="quest-side__label">0</div>
                <div class="quest-side__sub">Winner(s)</div>
              </div>
            </div>

            <ul class="quest-steps">
              <li class="quest-steps__item">
                <span class="quest-steps__dot quest-steps__dot--violet"></span>
                <div>
                  <div class="quest-steps__name">Your reward</div>
                  <div id="playerReward" class="quest-steps__meta">0 USDC</div>
                  <div id="playerAction" class="quest-side__action hidden"></div>
                </div>
              </li>
            </ul>
          </aside>
      </section>
    </div>
  </main>

  <footer class="footer">
    <div class="container footer__row">
      <p>© 2026 Questera. All rights reserved.</p>
      <p>Questera — quest platform with escrow payouts powered by GenLayer.</p>
    </div>
  </footer>
  <script type="module" src="/js/main.js"></script>
  <script>
    const area = document.getElementById('q-answer');
    const clearBtn = document.getElementById('clearInput');
    const startBtn = document.getElementById('startBtn');
    const answerBtn = document.getElementById('answerBtn');
    if (clearBtn) clearBtn.addEventListener('click', () => { if (area) area.value=''; });
    if (startBtn) startBtn.addEventListener('click', async () => {
        try {
          if (!WalletUI.isConnected()) throw new Error('Please connect your wallet first');
        } catch (e) { alert(e.message); return; }
        try {
          WalletUI.startQuestStudioNet();
        } catch(e) { alert(e.message); }
    });
    if (answerBtn) answerBtn.addEventListener('click', async () => {
        try {
          if (!WalletUI.isConnected()) throw new Error('Please connect your wallet first');
        } catch (e) { alert(e.message); return; }
        try {
          const value = (area && area.value || '').trim();
          if (!value) { alert('Please enter your answer'); return; }
          WalletUI.answerQuestStudioNet(value);
        } catch(e) { alert(e.message); }
    });
  </script>
</body>
</html>
`
}

async function deployContract(relayer, quests, bridge_in, bridge_out, creator, escrow, title, desc, image, prompt, end_date, pool) {
  const contractPath = path.join(__dirname, '../contracts/quest.py');
  const contractCode = readFileSync(contractPath, 'utf-8');
  
  const hash = await genLayerClient.deployContract({
    code: contractCode,
    args: [relayer, quests, bridge_in, bridge_out, creator, escrow, title, desc, image, prompt, end_date, pool],
    leaderOnly: false,
  });
  console.log('Quest tx on Bradbury:', hash);
  const receipt = await genLayerClient.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: 200,
    interval: 5000,
  });
  return receipt.data?.contract_address ?? receipt.txDataDecoded?.contractAddress;
}

async function deployContractStudioNet(relayer, quests, bridge_in, bridge_out, creator, escrow, title, desc, image, prompt, end_date, pool) {
  const contractPath = path.join(__dirname, '../contracts/quest.py');
  const contractCode = readFileSync(contractPath, 'utf-8');
  
  const hash = await genLayerClientStudioNet.deployContract({
    code: contractCode,
    args: [relayer, quests, bridge_in, bridge_out, creator, escrow, title, desc, image, prompt, end_date, pool],
    leaderOnly: false,
  });
  console.log('Quest tx on Studionet:', hash);
  const receipt = await genLayerClientStudioNet.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: 200,
    interval: 5000,
  });
  return receipt.data?.contract_address;
}
