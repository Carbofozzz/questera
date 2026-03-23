import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import AWS from 'aws-sdk';
import { bradburyNetwork, baseSepoliaNetwork } from './config/network.js';

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

// Static pages routes
app.get('/faq', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/faq.html'));
});

app.get('/quest/:id', async (req, res) => {
  try {
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.send(getCatPage(req));
  } catch(e) {
    return res.status(500).send('Failed to load quest', e);
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

function getCatPage(req) {
  return `<!doctype html>
  <html lang="en">

  </html>`
}
