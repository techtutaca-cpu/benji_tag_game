const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const WORLD_WIDTH = 2200;
const WORLD_HEIGHT = 1050;

// Game state
const players = {};
const gameState = {
  taggerId: null,
  gameStarted: false,
  roundTime: 120, // 2 minutes per round
  lastTagAt: 0
};

// Serve static files
app.use(express.static('public'));
app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create new player
  players[socket.id] = {
    id: socket.id,
    x: Math.random() * (WORLD_WIDTH - 200) + 100,
    y: Math.random() * 500 + 260,
    username: `Player${Object.keys(players).length}`,
    isTagged: false,
    abilities: {
      dash: { cooldown: 5000, lastUsed: 0 },
      shield: { cooldown: 10000, lastUsed: 0, duration: 3000 },
      freeze: { cooldown: 15000, lastUsed: 0, duration: 2000 }
    },
    activeEffects: {
      shielded: false,
      frozen: false
    },
    noTagUntil: 0
  };

  // If first player, make them the tagger
  if (Object.keys(players).length === 1) {
    players[socket.id].isTagged = true;
    gameState.taggerId = socket.id;
  }

  // Send current players to new player
  socket.emit('currentPlayers', players);
  socket.emit('gameState', gameState);

  // Notify other players about new player
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Handle player movement
  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].x = movementData.x;
      players[socket.id].y = movementData.y;
      players[socket.id].rotation = movementData.rotation;
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });

  // Handle tag event
  socket.on('tagPlayer', (targetId) => {
    const tagger = players[socket.id];
    const target = players[targetId];
    const now = Date.now();
    const rapidRetagBlocked = now - gameState.lastTagAt < 700;

    if (
      tagger &&
      target &&
      tagger.isTagged &&
      !target.isTagged &&
      !target.activeEffects.shielded &&
      now >= target.noTagUntil &&
      !rapidRetagBlocked
    ) {
      // Transfer tag
      tagger.isTagged = false;
      target.isTagged = true;
      gameState.taggerId = targetId;
      gameState.lastTagAt = now;
      tagger.noTagUntil = now + 1200;

      io.emit('playerTagged', {
        taggerId: targetId,
        previousTaggerId: socket.id
      });
      io.emit('gameState', gameState);
    }
  });

  // Handle ability usage
  socket.on('useAbility', (abilityData) => {
    const player = players[socket.id];
    if (!player) return;

    const ability = player.abilities[abilityData.type];
    const currentTime = Date.now();
    if (!ability) return;

    // Check cooldown
    if (currentTime - ability.lastUsed >= ability.cooldown) {
      if (abilityData.type === 'shield' && player.isTagged) {
        return;
      }
      if (abilityData.type === 'freeze' && !player.isTagged) {
        return;
      }
      ability.lastUsed = currentTime;

      // Apply ability effect
      switch (abilityData.type) {
        case 'dash':
          // Client handles dash movement
          io.emit('abilityUsed', {
            playerId: socket.id,
            type: 'dash',
            data: abilityData.data
          });
          break;

        case 'shield':
          player.activeEffects.shielded = true;
          io.emit('abilityUsed', {
            playerId: socket.id,
            type: 'shield'
          });
          setTimeout(() => {
            if (players[socket.id]) {
              players[socket.id].activeEffects.shielded = false;
              io.emit('effectEnded', {
                playerId: socket.id,
                effect: 'shield'
              });
            }
          }, ability.duration);
          break;

        case 'freeze':
          // Freeze nearby players
          const freezeRadius = (abilityData.data && abilityData.data.radius) || 190;
          const affectedPlayerIds = [];
          Object.keys(players).forEach(pid => {
            if (pid !== socket.id) {
              const otherPlayer = players[pid];
              const distance = Math.sqrt(
                Math.pow(player.x - otherPlayer.x, 2) +
                Math.pow(player.y - otherPlayer.y, 2)
              );

              if (distance <= freezeRadius && !otherPlayer.isTagged) {
                otherPlayer.activeEffects.frozen = true;
                affectedPlayerIds.push(pid);
                setTimeout(() => {
                  if (players[pid]) {
                    players[pid].activeEffects.frozen = false;
                    io.emit('effectEnded', {
                      playerId: pid,
                      effect: 'freeze'
                    });
                  }
                }, ability.duration);
              }
            }
          });

          io.emit('abilityUsed', {
            playerId: socket.id,
            type: 'freeze',
            data: { x: player.x, y: player.y, radius: freezeRadius, affectedPlayerIds }
          });
          break;
      }

      // Send updated cooldown
      socket.emit('abilityCooldown', {
        type: abilityData.type,
        cooldown: ability.cooldown
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);

    // If tagger left, assign new tagger
    if (gameState.taggerId === socket.id) {
      const remainingPlayers = Object.keys(players).filter(id => id !== socket.id);
      if (remainingPlayers.length > 0) {
        const newTaggerId = remainingPlayers[0];
        players[newTaggerId].isTagged = true;
        gameState.taggerId = newTaggerId;
        io.emit('playerTagged', {
          taggerId: newTaggerId,
          previousTaggerId: socket.id
        });
      } else {
        gameState.taggerId = null;
      }
    }

    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to play`);
});
