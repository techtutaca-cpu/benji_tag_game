# Multiplayer Tag Game with Abilities

A real-time multiplayer tag game built with Phaser.js and Socket.io, featuring special abilities and power-ups.

## Features

- **Real-time Multiplayer**: Play with multiple players using Socket.io
- **Tag Mechanics**: One player is the chaser, others are runners
- **Three Unique Abilities**:
  - **Dash (Q)**: Quick burst of speed in current direction (5s cooldown)
  - **Shield (E)**: Protect yourself from being tagged (10s cooldown, 3s duration)
  - **Freeze (R)**: Freeze nearby players (15s cooldown, 2s duration)
- **Top-down View**: Simple circular player sprites with directional indicators
- **Responsive Controls**: WASD or Arrow keys for movement

## Installation

1. Install Node.js dependencies:
```bash
npm install
```

## Running the Game

1. Start the server:
```bash
npm start
```

2. Open your browser and go to:
```
http://localhost:3000
```

3. Open multiple browser tabs/windows to test multiplayer

## Deploy (Render backend + Vercel frontend)

### 1) Backend on Render

- This repo now includes `render.yaml`.
- Create a Render Web Service from this repo.
- Render uses:
  - Build command: `npm ci`
  - Start command: `npm start`
- Set `FRONTEND_URL` in Render environment variables to your Vercel domain:
  - Example: `https://your-game.vercel.app`

### 2) Frontend on Vercel

- This repo now includes `vercel.json` to deploy static files from `public/`.
- In `public/js/runtime-config.js`, set:
  - `BACKEND_URL` to your Render backend URL
  - Example: `https://your-backend.onrender.com`
- Deploy the repo to Vercel.

### 3) Local env template

- `.env.example` includes required backend env vars.
- Copy to `.env` for local development and adjust values as needed.

## Controls

- **WASD** or **Arrow Keys**: Move your character
- **Q**: Dash ability
- **E**: Shield ability
- **R**: Freeze ability

## Game Rules

- One player starts as the **CHASER** (red)
- All other players are **RUNNERS** (green)
- The chaser must tag runners by touching them
- When tagged, the runner becomes the new chaser
- Use abilities strategically to avoid being tagged or catch runners

## Technology Stack

- **Phaser.js 3**: Game engine for rendering and physics
- **Socket.io**: Real-time multiplayer communication
- **Express**: Web server
- **Node.js**: Server runtime

## Project Structure

```
tag-game/
├── server.js           # Socket.io server and game logic
├── render.yaml         # Render deployment config (backend)
├── vercel.json         # Vercel deployment config (frontend)
├── .env.example        # Environment variable template
├── public/
│   ├── index.html      # Main HTML file
│   └── js/
│       ├── game.js           # Phaser.js game client
│       └── runtime-config.js # Frontend backend URL config
└── package.json        # Dependencies
```
