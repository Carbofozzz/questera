# Questera

Web platform for publishing and completing quests with escrow payouts in a stablecoin: a static frontend, a Node.js backend, and smart contracts on **GenLayer (Bradbury testnet)** and **Base Sepolia** (escrow in USDC).

## Project Overview

Users connect a wallet and create a quest (title, description, a prompt for verifying the answer, reward pool, end date, and a cover image). The server uploads the image to an S3-compatible storage, deploys an escrow contract on Base Sepolia, deploys the quest logic on GenLayer, and links the escrow with the quest contract. Quest catalog and interactions are handled via `genlayer-js` and the registry contract on Bradbury.

Any user can attempt the quest, interacting with the GenLayer AI ​​validators' consensus at every step. If successful, they will be able to claim their share of the quest pool; the claim opens one hour after the quest's completion. If no one participates in the quest, the creator can withdraw their contribution from the escrow contract.

## Tech Stack

| Layer | Technologies |
|------|----------------|
| Server | Express 5, `dotenv`, `morgan`, `cors`, image processing (`sharp`), AWS SDK for S3 |
| Client | HTML/CSS/JS (ES modules), `ethers`, `genlayer-js` (CDN in the browser) |
| Networks | GenLayer Bradbury (quests, registry), Base Sepolia (escrow, USDC) |
| Contracts | GenLayer Python contracts (`contracts/*.py`), Solidity escrow and build artifacts in `contracts/` |

## Repository Structure

```
questera/
├── public/           # Static files: pages, CSS, client JS (wallet, quests, portfolio)
├── src/
│   ├── start.js      # HTTP API, page serving, quest creation, GenLayer/Base
│   └── config/       # Network config and env var reading
├── contracts/        # GenLayer contracts, Solidity, build artifacts
├── package.json
└── README.md
```

## Getting Started

```bash
npm install
# create a .env file in the root with the required variables (see the table below)
npm run dev            # or npm start
```

By default, the server listens on the port from `PORT` or `3000`.

## Environment Variables

At minimum, you need a Base key and RPC, bridge/contract addresses, and optionally S3 credentials for cover uploads. Variable names come from the code:

| Variable | Purpose |
|----------|---------|
| `PRIVATE_KEY` | Server private key (Base + GenLayer account) |
| `BASE_SEPOLIA_RPC_URL` | Base Sepolia RPC URL |
| `BASE_SEPOLIA_USDC` | USDC address on Base Sepolia |
| `EVM_BRIDGE_IN` / `EVM_BRIDGE_OUT` | EVM-side bridge addresses |
| `IC_BRIDGE_IN` / `IC_BRIDGE_OUT` | GenLayer-side bridge addresses |
| `IC_QUESTS` | Quest registry contract address on Bradbury |
| `RELAYER` | Relayer address used for quest deployment |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_KEY`, `S3_SECRET` | S3-compatible storage for quest covers |
| `PORT` | HTTP server port |

Additionally, for displaying the network in the wallet: `NATIVE_CURRENCY_NAME`, `NATIVE_CURRENCY_SYMBOL` (optional).

## Scripts

- `npm start` — production mode (`NODE_ENV` is not set explicitly in the script)
- `npm run dev` — development mode with `NODE_ENV=development`

---

© Questera — a quest platform with escrow payouts powered by GenLayer.
