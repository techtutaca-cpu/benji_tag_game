const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

// Game state
const players = {};
const gameState = {
  taggerId: null,
  gameStarted: false,
  roundTime: 120 // 2 minutes per round
};

// Serve static files
app.use(express.static('public'));

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create new player
  players[socket.id] = {
    id: socket.id,
    x: Math.random() * 1200 + 100,
    y: Math.random() * 500 + 100,
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
    }
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

    if (tagger && target && tagger.isTagged && !target.isTagged && !target.activeEffects.shielded) {
      // Transfer tag
      tagger.isTagged = false;
      target.isTagged = true;
      gameState.taggerId = targetId;

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

    // Check cooldown
    if (currentTime - ability.lastUsed >= ability.cooldown) {
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
          const freezeRadius = abilityData.data.radius;
          Object.keys(players).forEach(pid => {
            if (pid !== socket.id) {
              const otherPlayer = players[pid];
              const distance = Math.sqrt(
                Math.pow(player.x - otherPlayer.x, 2) +
                Math.pow(player.y - otherPlayer.y, 2)
              );

              if (distance <= freezeRadius) {
                otherPlayer.activeEffects.frozen = true;
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
            data: { x: player.x, y: player.y, radius: freezeRadius }
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
