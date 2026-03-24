import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import AWS from 'aws-sdk';
import { bradburyNetwork, baseSepoliaNetwork, getPrivateKey } from './config/network.js';
import sharp from 'sharp';
import { ethers } from "ethers";
import { createAccount, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from 'genlayer-js/types';

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

// initialize GenLayer client
const privateKey = getPrivateKey();
const account = createAccount(`0x${privateKey.replace(/^0x/, "")}`);
const genLayerClient = createClient({
  chain: testnetBradbury,
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

app.get('/api/config/network_base_sepolia', (_req, res) => {
  return res.json(baseSepoliaNetwork);
});

// dynamic page routes
app.get('/quest/:id', async (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(getCatPage(req));
  } catch(e) {
    return res.status(500).send('Failed to load quest', e);
  }
});

// static pages routes
app.get('/faq', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/faq.html'));
});

app.get('/me', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/me.html'));
});

app.get('/create', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/create.html'));
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// api
app.post('/api/create', async (req, res) => {
  try {
    const { image, title, desc, creator, date, pool } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Invalid title' });
    }
    if (typeof desc !== 'string' || !desc.trim()) {
      return res.status(400).json({ error: 'Invalid description' });
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

    const transactionHash = await genLayerClient.writeContract({
      address: '0x799FbF3f9C7D40F19522555a119c58433A45decE',
      functionName: 'add_quest',
      args: [creator.trim(), creator.trim(), title.trim(), desc.trim(), s3Url, expirationTimestamp, rewardPool], 
    });
    console.log("transactionHash", transactionHash);
    const receipt = await genLayerClient.waitForTransactionReceipt({
      hash: transactionHash,
      status: TransactionStatus.ACCEPTED,
      retries: 200,
      interval: 5000,
    });
     
    console.log('Transaction confirmed:', receipt);


    return res.json({
      id,
      url: s3Url,
      title: title.trim(),
      desc: desc.trim(),
      creator: creator.trim(),
      pool: rewardPool,
      date: expirationTimestamp
    });
  } catch (e) {
    console.error('Error creating a quest:', e);
    return res.status(500).json({ error: 'Error creating a quest' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

function getCatPage(req) {
  return `<!doctype html>
  <html lang="en">

  </html>`
}
