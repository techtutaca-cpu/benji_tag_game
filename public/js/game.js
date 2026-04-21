// Get game configuration from index.html
const gameConfig = window.gameConfig || { character: 'ninja', mode: 'multi' };
const isSinglePlayer = gameConfig.mode === 'single';
const backendUrl = gameConfig.backendUrl || window.location.origin;
const VIEW_WIDTH = 1400;
const VIEW_HEIGHT = 800;
const WORLD_WIDTH = 2200;
const WORLD_HEIGHT = 1050;

// Only create socket for multiplayer
const socket = isSinglePlayer ? null : io(backendUrl, {
    transports: ['websocket', 'polling']
});

window.exitCurrentMatchInternal = function exitCurrentMatchInternal() {
    if (socket && socket.connected) {
        socket.disconnect();
    }
    window.location.reload();
};

const config = {
    type: Phaser.AUTO,
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#87CEEB',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 600 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

let player;
let otherPlayers = {};
let aiPlayers = [];
let platforms;
let cursors;
let wasd;
let isTagged = false;
let playerSpeed = 300;
let jumpPower = 600;
let cooldowns = {
    dash: 0,
    shield: 0,
    freeze: 0
};
let isGrounded = false;
let coyoteTimeLeft = 0;
let jumpBufferLeft = 0;
let singleTagLockUntil = 0;
let lastMultiplayerTagAttemptAt = 0;
let roundState = {
    remainingMs: 180000,
    playerChaserMs: 0,
    ended: false
};

const movementTuning = {
    coyoteTimeMs: 120,
    jumpBufferMs: 130,
    tagTransferGraceMs: 950
};

const abilityRules = {
    dash: { cooldownMs: 5000, power: 560 },
    shield: { cooldownMs: 10000, durationMs: 3000 },
    freeze: { cooldownMs: 15000, durationMs: 2000, radius: 190 }
};

// Character data with emoji icons
const characters = {
    ninja: { icon: '🥷', color: 0x2c3e50, speed: 350 },
    robot: { icon: '🤖', color: 0x7f8c8d, speed: 250 },
    alien: { icon: '👽', color: 0x27ae60, speed: 300 },
    wizard: { icon: '🧙', color: 0x8e44ad, speed: 280 },
    knight: { icon: '⚔️', color: 0x3498db, speed: 270 },
    vampire: { icon: '🧛', color: 0xe74c3c, speed: 320 },
    pirate: { icon: '🏴‍☠️', color: 0x16a085, speed: 290 },
    astronaut: { icon: '👨‍🚀', color: 0xf39c12, speed: 310 }
};

function createNameTag(scene, x, y, text) {
    return scene.add.text(x, y, text, {
        fontSize: '16px',
        fill: '#f2fbff',
        backgroundColor: 'rgba(7, 18, 40, 0.72)',
        padding: { x: 7, y: 3 }
    })
        .setOrigin(0.5)
        .setStroke('#0b172b', 3);
}

function preload() {
    // Load character images from assets folder
    this.load.image('ninja', 'assets/ninja.png');
    this.load.image('robot', 'assets/robot.png');
}

function createCharacterSprite(scene, charType, isChaser) {
    const textureName = `${charType}_${isChaser ? 'chaser' : 'runner'}`;

    // Check if we have a loaded image for this character
    if (scene.textures.exists(charType)) {
        return charType;
    }

    // Create programmatic sprite (side-view for platformer)
    const char = characters[charType] || characters.ninja;
    const graphics = scene.add.graphics();
    const baseColor = isChaser ? 0xf7445d : char.color;
    const outlineColor = isChaser ? 0xffc2cb : 0x0e1f3d;
    const accentColor = isChaser ? 0xff8ca2 : 0xa8e9ff;

    // Shadow base
    graphics.fillStyle(0x000000, 0.25);
    graphics.fillEllipse(20, 37, 20, 6);

    // Head
    graphics.fillStyle(baseColor, 1);
    graphics.fillCircle(20, 10, 9);
    graphics.lineStyle(2, outlineColor, 1);
    graphics.strokeCircle(20, 10, 9);

    // Eyes
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(17, 8, 2.2);
    graphics.fillCircle(23, 8, 2.2);
    graphics.fillStyle(0x000000, 1);
    graphics.fillCircle(17, 8, 1);
    graphics.fillCircle(23, 8, 1);

    // Headband / visor
    graphics.fillStyle(accentColor, 0.85);
    graphics.fillRoundedRect(11, 11, 18, 4, 2);

    // Body/torso
    graphics.fillStyle(baseColor, 1);
    graphics.fillRoundedRect(14, 18, 12, 13, 2);
    graphics.lineStyle(2, outlineColor, 1);
    graphics.strokeRoundedRect(14, 18, 12, 13, 2);

    // Chest accent
    graphics.fillStyle(accentColor, 0.6);
    graphics.fillRoundedRect(17, 21, 6, 4, 1);

    // Arms
    graphics.fillStyle(baseColor, 1);
    graphics.fillRoundedRect(9, 18, 5, 10, 2);
    graphics.fillRoundedRect(26, 18, 5, 10, 2);
    graphics.lineStyle(2, outlineColor, 1);
    graphics.strokeRoundedRect(9, 18, 5, 10, 2);
    graphics.strokeRoundedRect(26, 18, 5, 10, 2);

    // Legs
    graphics.fillStyle(baseColor, 1);
    graphics.fillRoundedRect(15, 30, 4, 9, 1.5);
    graphics.fillRoundedRect(21, 30, 4, 9, 1.5);
    graphics.lineStyle(2, outlineColor, 1);
    graphics.strokeRoundedRect(15, 30, 4, 9, 1.5);
    graphics.strokeRoundedRect(21, 30, 4, 9, 1.5);

    // Glow for chaser
    if (isChaser) {
        graphics.lineStyle(2, 0xff6f86, 0.7);
        graphics.strokeCircle(20, 20, 17);
    } else {
        graphics.lineStyle(1, 0x74deff, 0.65);
        graphics.strokeCircle(20, 20, 16);
    }

    graphics.generateTexture(textureName, 40, 40);
    graphics.destroy();

    return textureName;
}

function createPlatforms(scene) {
    platforms = scene.physics.add.staticGroup();

    drawArenaBackdrop(scene);

    const drawPlatformVisual = (x, y, width, height) => {
        scene.add.rectangle(x, y + 2, width + 8, height + 8, 0x000000, 0.22);
        scene.add.rectangle(x, y, width, height, 0x294c72);
        scene.add.rectangle(x, y - 4, width, 6, 0x70d9ff);
        scene.add.rectangle(x, y + 4, width - 6, 5, 0x1f3f62, 0.75);
    };

    // Ground and side walls
    platforms.create(WORLD_WIDTH / 2, 965, null).setScale(WORLD_WIDTH / 32, 85 / 32).refreshBody();
    drawPlatformVisual(WORLD_WIDTH / 2, 965, WORLD_WIDTH, 85);
    platforms.create(8, 520, null).setScale(16 / 32, WORLD_HEIGHT / 32).refreshBody();
    platforms.create(WORLD_WIDTH - 8, 520, null).setScale(16 / 32, WORLD_HEIGHT / 32).refreshBody();

    // Arena platforms
    const platformLayout = [
        [220, 790, 190, 24],
        [420, 655, 160, 22],
        [630, 535, 170, 22],
        [900, 790, 230, 24],
        [1120, 640, 170, 22],
        [1350, 510, 180, 22],
        [1600, 790, 240, 24],
        [1820, 640, 170, 22],
        [2000, 500, 140, 22],
        [1100, 390, 220, 22],
        [760, 400, 180, 20]
    ];

    platformLayout.forEach(([x, y, w, h]) => {
        platforms.create(x, y, null).setScale(w / 32, h / 32).refreshBody();
        drawPlatformVisual(x, y, w, h);
    });

    return platforms;
}

function drawArenaBackdrop(scene) {
    const gradient = scene.add.graphics();
    gradient.fillGradientStyle(0x06122f, 0x06122f, 0x1f4f7a, 0x1f4f7a, 1);
    gradient.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Arena stands
    const stands = scene.add.graphics();
    stands.fillStyle(0x152c50, 0.92);
    stands.fillRoundedRect(0, 90, WORLD_WIDTH, 180, 0);
    stands.fillStyle(0x0f2546, 0.94);
    stands.fillRoundedRect(0, 240, WORLD_WIDTH, 130, 0);

    // Crowd lights
    for (let x = 24; x < WORLD_WIDTH; x += 36) {
        const yTop = Phaser.Math.Between(120, 220);
        scene.add.rectangle(x, yTop, 4, 4, Phaser.Math.Between(0x47b9ff, 0xffc56a), Phaser.Math.FloatBetween(0.45, 0.9));
        if (Math.random() > 0.5) {
            scene.add.rectangle(x + 8, yTop + 65, 3, 3, 0xdaf3ff, Phaser.Math.FloatBetween(0.35, 0.8));
        }
    }

    // Spotlights and scoreboard
    scene.add.rectangle(220, 90, 180, 18, 0x7fe1ff, 0.85);
    scene.add.rectangle(WORLD_WIDTH - 220, 90, 180, 18, 0x7fe1ff, 0.85);
    scene.add.rectangle(WORLD_WIDTH / 2, 140, 440, 120, 0x0b1f3e, 0.82).setStrokeStyle(4, 0x58d2ff, 0.8);
    scene.add.text(WORLD_WIDTH / 2, 110, 'TAG ARENA • ROUND ACTIVE', {
        fontFamily: 'Rajdhani',
        fontSize: '34px',
        fontStyle: '700',
        color: '#9ce7ff'
    }).setOrigin(0.5);

    // Mid-level haze
    const haze = scene.add.rectangle(WORLD_WIDTH / 2, 510, WORLD_WIDTH, 160, 0x89dfff, 0.08);
    scene.tweens.add({
        targets: haze,
        alpha: 0.17,
        duration: 2500,
        yoyo: true,
        repeat: -1
    });
}

function create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    const roundInfoEl = document.getElementById('round-info');
    if (roundInfoEl) {
        roundInfoEl.textContent = isSinglePlayer ? 'Round 180s | Your Chaser Time 0.0s' : 'Live Match';
    }

    // Create platforms
    createPlatforms(this);

    // Create character sprites
    Object.keys(characters).forEach(charType => {
        if (!this.textures.exists(charType)) {
            createCharacterSprite(this, charType, false);
            createCharacterSprite(this, charType, true);
        }
    });

    // Input
    cursors = this.input.keyboard.createCursorKeys();
    wasd = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        dash: Phaser.Input.Keyboard.KeyCodes.Q,
        shield: Phaser.Input.Keyboard.KeyCodes.E,
        freeze: Phaser.Input.Keyboard.KeyCodes.R
    });

    if (isSinglePlayer) {
        setupSinglePlayer(this);
    } else {
        setupMultiplayer(this);
    }

    // Ability button click handlers
    document.getElementById('dash-btn').addEventListener('click', () => useAbility('dash', this));
    document.getElementById('shield-btn').addEventListener('click', () => useAbility('shield', this));
    document.getElementById('freeze-btn').addEventListener('click', () => useAbility('freeze', this));
}

function setupSinglePlayer(scene) {
    const playerChar = gameConfig.character;
    const textureName = scene.textures.exists(playerChar) ? playerChar : `${playerChar}_runner`;

    player = {
        sprite: scene.physics.add.sprite(100, 700, textureName),
        character: playerChar,
        nameText: null,
        effects: {},
        isAI: false
    };

    player.sprite.setBounce(0.2);
    player.sprite.setCollideWorldBounds(true);

    if (scene.textures.exists(playerChar)) {
        player.sprite.setScale(0.15);
    } else {
        player.sprite.setScale(1.2);
    }

    const char = characters[playerChar];
    playerSpeed = char.speed;

    player.nameText = createNameTag(scene, 100, 650, 'You');

    scene.physics.add.collider(player.sprite, platforms);
    scene.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    scene.cameras.main.startFollow(player.sprite, true, 0.08, 0.08);
    scene.cameras.main.setZoom(0.93);

    // Create AI players
    const aiCharTypes = ['robot', 'alien', 'wizard'];
    const aiPositions = [
        { x: 1700, y: 760 },
        { x: 1250, y: 580 },
        { x: 500, y: 500 }
    ];

    aiCharTypes.forEach((charType, index) => {
        const aiTexture = scene.textures.exists(charType) ? charType : `${charType}_chaser`;
        const aiSprite = scene.physics.add.sprite(aiPositions[index].x, aiPositions[index].y, aiTexture);
        aiSprite.setBounce(0.2);
        aiSprite.setCollideWorldBounds(true);

        if (scene.textures.exists(charType)) {
            aiSprite.setScale(0.15);
            aiSprite.setTint(0xff0000);
        } else {
            aiSprite.setScale(1.2);
        }

        const aiName = createNameTag(scene, aiPositions[index].x, aiPositions[index].y - 40, `AI ${index + 1}`);

        scene.physics.add.collider(aiSprite, platforms);

        aiPlayers.push({
            sprite: aiSprite,
            character: charType,
            nameText: aiName,
            effects: {},
            isAI: true,
            isTagged: index === 0,
            intentDir: 0,
            reactionTime: Phaser.Math.Between(50, 160),
            aggression: Phaser.Math.FloatBetween(0.25, 0.9),
            panicJumpUntil: 0
        });
    });

    isTagged = false;
    updateStatus('You are a RUNNER! Avoid the AI chaser!');
    updatePlayerCount(aiPlayers.length + 1);
}

function setupMultiplayer(scene) {
    socket.on('currentPlayers', (players) => {
        Object.keys(players).forEach((id) => {
            if (id === socket.id) {
                addPlayer(scene, players[id], true);
            } else {
                addPlayer(scene, players[id], false);
            }
        });
        updatePlayerCount(Object.keys(players).length);
    });

    socket.on('newPlayer', (playerInfo) => {
        addPlayer(scene, playerInfo, false);
        updatePlayerCount(Object.keys(otherPlayers).length + 1);
    });

    socket.on('playerDisconnected', (playerId) => {
        if (otherPlayers[playerId]) {
            otherPlayers[playerId].sprite.destroy();
            if (otherPlayers[playerId].nameText) {
                otherPlayers[playerId].nameText.destroy();
            }
            if (otherPlayers[playerId].effects) {
                Object.values(otherPlayers[playerId].effects).forEach(effect => {
                    if (Array.isArray(effect)) {
                        effect.forEach(obj => obj && obj.destroy());
                    } else if (effect) effect.destroy();
                });
            }
            delete otherPlayers[playerId];
        }
        updatePlayerCount(Object.keys(otherPlayers).length + 1);
    });

    socket.on('playerMoved', (playerInfo) => {
        if (otherPlayers[playerInfo.id]) {
            otherPlayers[playerInfo.id].sprite.setPosition(playerInfo.x, playerInfo.y);
            if (otherPlayers[playerInfo.id].nameText) {
                otherPlayers[playerInfo.id].nameText.setPosition(playerInfo.x, playerInfo.y - 40);
            }
            updateEffectPositions(playerInfo.id, playerInfo.x, playerInfo.y);
        }
    });

    socket.on('playerTagged', (data) => {
        if (data.taggerId === socket.id) {
            isTagged = true;
            updatePlayerSprite(player.sprite, player.character, true);
            updateStatus('You are the CHASER! Tag others!');
        } else if (data.previousTaggerId === socket.id) {
            isTagged = false;
            updatePlayerSprite(player.sprite, player.character, false);
            updateStatus('You are a RUNNER! Avoid the chaser!');
        }

        if (otherPlayers[data.taggerId]) {
            updatePlayerSprite(otherPlayers[data.taggerId].sprite, otherPlayers[data.taggerId].character, true);
        }
        if (otherPlayers[data.previousTaggerId]) {
            updatePlayerSprite(otherPlayers[data.previousTaggerId].sprite, otherPlayers[data.previousTaggerId].character, false);
        }
    });

    socket.on('gameState', (gameState) => {
        if (gameState.taggerId === socket.id) {
            isTagged = true;
            if (player) {
                updatePlayerSprite(player.sprite, player.character, true);
                updateStatus('You are the CHASER! Tag others!');
            }
        } else {
            isTagged = false;
            if (player) {
                updatePlayerSprite(player.sprite, player.character, false);
                updateStatus('You are a RUNNER! Avoid the chaser!');
            }
        }
    });

    socket.on('abilityUsed', (data) => {
        handleAbilityEffect(scene, data);
    });

    socket.on('effectEnded', (data) => {
        const targetPlayer = data.playerId === socket.id ? player : otherPlayers[data.playerId];
        if (targetPlayer && targetPlayer.effects && targetPlayer.effects[data.effect]) {
            if (data.effect === 'shield') {
                clearShieldEffect(targetPlayer);
            } else if (data.effect === 'freeze') {
                const effect = targetPlayer.effects.freeze;
                if (effect && effect.timeoutId) {
                    clearTimeout(effect.timeoutId);
                }
                if (effect && effect.visual) {
                    effect.visual.destroy();
                }
                targetPlayer.effects.freeze = null;
            } else {
                targetPlayer.effects[data.effect] = null;
            }
            if (data.effect === 'shield' || data.effect === 'freeze') {
                if (data.playerId !== socket.id && otherPlayers[data.playerId]) {
                    if (data.effect === 'shield') {
                        otherPlayers[data.playerId].shielded = false;
                    }
                    if (data.effect === 'freeze') {
                        otherPlayers[data.playerId].frozen = false;
                    }
                }
                if (!(targetPlayer.effects && targetPlayer.effects.shield)) {
                    targetPlayer.sprite.clearTint();
                }
            }
        }
    });
}

function update() {
    if (!player) return;
    const delta = game.loop.delta;

    if (isSinglePlayer && roundState.ended) {
        updateCooldownDisplay();
        return;
    }

    if (isSinglePlayer) {
        updateAI(this, delta);
    }

    let targetVelocityX = 0;
    const groundedNow = player.sprite.body.touching.down || player.sprite.body.blocked.down;
    isGrounded = groundedNow;

    if (groundedNow) {
        coyoteTimeLeft = movementTuning.coyoteTimeMs;
    } else {
        coyoteTimeLeft = Math.max(0, coyoteTimeLeft - delta);
    }

    if (jumpBufferLeft > 0) {
        jumpBufferLeft = Math.max(0, jumpBufferLeft - delta);
    }

    // Check if frozen
    if (isPlayerFrozen(player)) {
        player.sprite.setVelocityX(0);
        return;
    }

    // Movement
    if (cursors.left.isDown || wasd.left.isDown) {
        targetVelocityX = -playerSpeed;
        player.sprite.setFlip(true, false);
    } else if (cursors.right.isDown || wasd.right.isDown) {
        targetVelocityX = playerSpeed;
        player.sprite.setFlip(false, false);
    }

    const currentVx = player.sprite.body.velocity.x;
    player.sprite.setVelocityX(Phaser.Math.Linear(currentVx, targetVelocityX, groundedNow ? 0.24 : 0.16));

    const jumpPressed = Phaser.Input.Keyboard.JustDown(cursors.up) || Phaser.Input.Keyboard.JustDown(wasd.up);
    if (jumpPressed) {
        jumpBufferLeft = movementTuning.jumpBufferMs;
    }

    // Jumping with coyote time and jump buffer
    if (jumpBufferLeft > 0 && coyoteTimeLeft > 0) {
        player.sprite.setVelocityY(-jumpPower);
        jumpBufferLeft = 0;
        coyoteTimeLeft = 0;
    }

    // Variable jump height: release early to do short hops
    const jumpHeld = cursors.up.isDown || wasd.up.isDown;
    if (!jumpHeld && player.sprite.body.velocity.y < -120) {
        player.sprite.setVelocityY(player.sprite.body.velocity.y * 0.9);
    }

    // Update name position
    if (player.nameText) {
        player.nameText.setPosition(player.sprite.x, player.sprite.y - 40);
    }

    updateEffectPositions(socket ? socket.id : 'player', player.sprite.x, player.sprite.y);

    // Send position to server
    if (!isSinglePlayer && socket) {
        socket.emit('playerMovement', {
            x: player.sprite.x,
            y: player.sprite.y
        });
    }

    // Check tag collision
    if (isSinglePlayer) {
        handleSinglePlayerTagging(this);
        updateRoundRules(delta);
    } else {
        handleMultiplayerTagging();
    }

    if (Phaser.Input.Keyboard.JustDown(wasd.dash)) {
        useAbility('dash', this);
    }
    if (Phaser.Input.Keyboard.JustDown(wasd.shield)) {
        useAbility('shield', this);
    }
    if (Phaser.Input.Keyboard.JustDown(wasd.freeze)) {
        useAbility('freeze', this);
    }

    updateCooldownDisplay();
}

function updateRoundRules(delta) {
    if (roundState.ended) {
        return;
    }

    roundState.remainingMs = Math.max(0, roundState.remainingMs - delta);
    if (isTagged) {
        roundState.playerChaserMs += delta;
    }

    const roundInfoEl = document.getElementById('round-info');
    if (roundInfoEl) {
        const remaining = Math.ceil(roundState.remainingMs / 1000);
        const chasedFor = (roundState.playerChaserMs / 1000).toFixed(1);
        roundInfoEl.textContent = `Round ${remaining}s | Your Chaser Time ${chasedFor}s`;
    }

    if (roundState.remainingMs <= 0) {
        roundState.ended = true;
        const playerChaserSec = roundState.playerChaserMs / 1000;
        const winMessage = playerChaserSec < 60
            ? `Round over. You win with only ${playerChaserSec.toFixed(1)}s as chaser.`
            : `Round over. You lose with ${playerChaserSec.toFixed(1)}s as chaser.`;
        updateStatus(winMessage);
        player.sprite.setVelocity(0, 0);
        aiPlayers.forEach((ai) => ai.sprite && ai.sprite.setVelocity(0, 0));
    }
}

function updateAI(scene, delta) {
    aiPlayers.forEach((ai) => {
        if (!ai.sprite || !ai.sprite.active) return;
        if (ai.effects && ai.effects.freeze) {
            ai.sprite.setVelocityX(0);
            return;
        }

        const canJump = ai.sprite.body.touching.down || ai.sprite.body.blocked.down;
        const playerVx = player.sprite.body.velocity.x || 0;
        const distanceX = player.sprite.x - ai.sprite.x;
        const distanceY = player.sprite.y - ai.sprite.y;
        const distance = Math.abs(distanceX);
        const baseAiSpeed = (characters[ai.character]?.speed || 280) * (ai.character === 'robot' ? 0.9 : 1);
        const targetPredictionX = Phaser.Math.Clamp(
            player.sprite.x + playerVx * (0.15 + ai.aggression * 0.22),
            40,
            1360
        );

        ai.reactionTime -= delta;
        if (ai.reactionTime <= 0) {
            if (ai.isTagged) {
                const leadError = targetPredictionX - ai.sprite.x;
                ai.intentDir = leadError > 16 ? 1 : leadError < -16 ? -1 : 0;
            } else {
                const away = ai.sprite.x >= player.sprite.x ? 1 : -1;
                const crowding = distance < 210 ? 1 : 0.6;
                ai.intentDir = away * crowding;
            }

            if (ai.sprite.x < 80) ai.intentDir = 1;
            if (ai.sprite.x > 1320) ai.intentDir = -1;

            ai.reactionTime = Phaser.Math.Between(85, 170);
        }

        const desiredVx = ai.intentDir * baseAiSpeed * (ai.isTagged ? 1.06 : 0.94);
        ai.sprite.setVelocityX(Phaser.Math.Linear(ai.sprite.body.velocity.x, desiredVx, canJump ? 0.23 : 0.13));
        ai.sprite.setFlip(ai.intentDir < 0, false);

        const obstacleAhead =
            (ai.intentDir > 0.2 && ai.sprite.body.blocked.right) ||
            (ai.intentDir < -0.2 && ai.sprite.body.blocked.left);
        const targetAbove = distanceY < -24;
        const shouldJumpForPath = canJump && (
            obstacleAhead ||
            (ai.isTagged && targetAbove && distance < 260) ||
            (!ai.isTagged && isTagged && distance < 160)
        );

        if (shouldJumpForPath) {
            ai.sprite.setVelocityY(-jumpPower * Phaser.Math.FloatBetween(0.82, 0.95));
        } else if (canJump && Math.random() < (ai.isTagged ? 0.005 : 0.003)) {
            ai.sprite.setVelocityY(-jumpPower * Phaser.Math.FloatBetween(0.75, 0.9));
        }

        if (ai.nameText) {
            ai.nameText.setPosition(ai.sprite.x, ai.sprite.y - 40);
        }
    });
}

function handleSinglePlayerTagging(scene) {
    if (Date.now() < singleTagLockUntil) {
        return;
    }

    aiPlayers.forEach((ai) => {
        if (!ai.sprite || !ai.sprite.active) return;

        const distance = Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, ai.sprite.x, ai.sprite.y);

        if (ai.isTagged && distance < 50) {
            if (player.effects && player.effects.shield) {
                ai.sprite.setVelocityX((ai.sprite.x < player.sprite.x ? -1 : 1) * 240);
                ai.sprite.setVelocityY(-220);
                return;
            }
            ai.isTagged = false;
            isTagged = true;
            singleTagLockUntil = Date.now() + movementTuning.tagTransferGraceMs;
            updatePlayerSprite(ai.sprite, ai.character, false);
            updatePlayerSprite(player.sprite, gameConfig.character, true);
            updateStatus('You are the CHASER! Tag the AI runners!');
            flashTagTransfer(scene, player.sprite.x, player.sprite.y, 0xf7445d);
        } else if (isTagged && !ai.isTagged && distance < 50) {
            isTagged = false;
            ai.isTagged = true;
            singleTagLockUntil = Date.now() + movementTuning.tagTransferGraceMs;
            updatePlayerSprite(player.sprite, gameConfig.character, false);
            updatePlayerSprite(ai.sprite, ai.character, true);
            updateStatus('You are a RUNNER! Avoid the AI chaser!');
            flashTagTransfer(scene, ai.sprite.x, ai.sprite.y, 0x2fd5c0);
        }
    });
}

function handleMultiplayerTagging() {
    if (!socket || !player || !isTagged) {
        return;
    }
    const now = Date.now();
    if (now - lastMultiplayerTagAttemptAt < 140) {
        return;
    }
    let closestId = null;
    let closestDist = Infinity;
    Object.entries(otherPlayers).forEach(([id, other]) => {
        if (!other || !other.sprite || other.shielded) {
            return;
        }
        const dist = Phaser.Math.Distance.Between(
            player.sprite.x,
            player.sprite.y,
            other.sprite.x,
            other.sprite.y
        );
        if (dist < 56 && dist < closestDist) {
            closestDist = dist;
            closestId = id;
        }
    });

    if (closestId) {
        lastMultiplayerTagAttemptAt = now;
        socket.emit('tagPlayer', closestId);
    }
}

function flashTagTransfer(scene, x, y, color) {
    const pulse = scene.add.circle(x, y, 16, color, 0.35);
    pulse.setStrokeStyle(4, color, 0.75);
    scene.tweens.add({
        targets: pulse,
        radius: 110,
        alpha: 0,
        duration: 360,
        ease: 'Quad.easeOut',
        onComplete: () => pulse.destroy()
    });
}

function addPlayer(scene, playerInfo, isSelf) {
    const charType = gameConfig.character;
    const textureName = scene.textures.exists(charType) ? charType : `${charType}_${playerInfo.isTagged ? 'chaser' : 'runner'}`;
    const sprite = scene.physics.add.sprite(playerInfo.x, playerInfo.y, textureName);

    sprite.setBounce(0.2);
    sprite.setCollideWorldBounds(true);

    if (scene.textures.exists(charType)) {
        sprite.setScale(0.15);
        if (playerInfo.isTagged) {
            sprite.setTint(0xff0000);
        }
    } else {
        sprite.setScale(1.2);
    }

    const nameText = createNameTag(scene, playerInfo.x, playerInfo.y - 40, playerInfo.username);

    scene.physics.add.collider(sprite, platforms);

    if (isSelf) {
        player = {
            sprite: sprite,
            character: charType,
            nameText: nameText,
            effects: {}
        };
        scene.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
        scene.cameras.main.startFollow(player.sprite, true, 0.08, 0.08);
        scene.cameras.main.setZoom(0.93);
        isTagged = playerInfo.isTagged;
        playerSpeed = characters[charType]?.speed || 300;
        updateStatus(isTagged ? 'You are the CHASER! Tag others!' : 'You are a RUNNER! Avoid the chaser!');
    } else {
        otherPlayers[playerInfo.id] = {
            sprite: sprite,
            character: charType,
            nameText: nameText,
            shielded: false,
            frozen: false,
            effects: {}
        };
    }
}

function updatePlayerSprite(sprite, charType, isChaser) {
    if (sprite.scene.textures.exists(charType)) {
        sprite.setTexture(charType);
        if (isChaser) {
            sprite.setTint(0xff0000);
        } else {
            sprite.clearTint();
        }
    } else {
        const textureName = `${charType}_${isChaser ? 'chaser' : 'runner'}`;
        sprite.setTexture(textureName);
    }
}

function useAbility(type, scene) {
    const now = Date.now();

    if (cooldowns[type] && now < cooldowns[type]) {
        return;
    }

    let data = {};

    switch (type) {
        case 'dash':
            if (isPlayerFrozen(player)) return;
            const direction = player.sprite.flipX ? -1 : 1;
            player.sprite.setVelocityX(direction * abilityRules.dash.power);
            player.sprite.setVelocityY(player.sprite.body.velocity.y * 0.7);
            data = { direction: direction };
            cooldowns.dash = now + abilityRules.dash.cooldownMs;
            break;

        case 'shield':
            if (isTagged) {
                updateStatus('Shield is for RUNNERS only.');
                return;
            }
            addShieldEffect(scene, player, socket ? socket.id : 'player');
            cooldowns.shield = now + abilityRules.shield.cooldownMs;
            setTimeout(() => {
                if (player.effects && player.effects.shield) {
                    clearShieldEffect(player);
                }
            }, abilityRules.shield.durationMs);
            break;

        case 'freeze':
            if (!isTagged) {
                updateStatus('Freeze is for CHASER only.');
                return;
            }
            data = { radius: abilityRules.freeze.radius };
            cooldowns.freeze = now + abilityRules.freeze.cooldownMs;
            if (isSinglePlayer) {
                aiPlayers.forEach((ai) => {
                    if (!ai.sprite || ai.isTagged) return;
                    const dist = Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, ai.sprite.x, ai.sprite.y);
                    if (dist <= abilityRules.freeze.radius) {
                        applyFreezeEffect(scene, ai, abilityRules.freeze.durationMs);
                    }
                });
                handleAbilityEffect(scene, {
                    type: 'freeze',
                    playerId: 'player',
                    data: { x: player.sprite.x, y: player.sprite.y, radius: abilityRules.freeze.radius }
                });
            }
            break;
    }

    if (!isSinglePlayer && socket) {
        socket.emit('useAbility', { type: type, data: data });
    }
}

function handleAbilityEffect(scene, data) {
    switch (data.type) {
        case 'dash':
            if (data.playerId !== socket.id && otherPlayers[data.playerId]) {
                const sprite = otherPlayers[data.playerId].sprite;
                const dir = data.data.direction || 1;
                sprite.setVelocityX(dir * abilityRules.dash.power);
            }
            break;

        case 'shield':
            const targetPlayer = data.playerId === socket.id ? player : otherPlayers[data.playerId];
            if (targetPlayer) {
                addShieldEffect(scene, targetPlayer, data.playerId);
            }
            break;

        case 'freeze':
            const freezeCenter = scene.add.circle(data.data.x, data.data.y, 5, 0x00E8FF, 0.8);
            const freezeRing1 = scene.add.circle(data.data.x, data.data.y, data.data.radius, 0x00D4FF, 0.2);
            freezeRing1.setStrokeStyle(3, 0x00E8FF);
            const freezeRing2 = scene.add.circle(data.data.x, data.data.y, data.data.radius * 0.7, 0x00A8E8, 0.1);
            freezeRing2.setStrokeStyle(2, 0x00A8E8);
            
            scene.tweens.add({
                targets: [freezeCenter, freezeRing1, freezeRing2],
                alpha: 0,
                scale: 1.2,
                duration: 800,
                onComplete: () => {
                    freezeCenter.destroy();
                    freezeRing1.destroy();
                    freezeRing2.destroy();
                }
            });

            if (Array.isArray(data.data.affectedPlayerIds)) {
                data.data.affectedPlayerIds.forEach((pid) => {
                    const target = pid === socket.id ? player : otherPlayers[pid];
                    if (target) {
                        applyFreezeEffect(scene, target, abilityRules.freeze.durationMs);
                    }
                });
            }
            break;
    }
}

function applyFreezeEffect(scene, targetPlayer, durationMs) {
    if (!targetPlayer || !targetPlayer.sprite) {
        return;
    }
    if (!targetPlayer.effects) {
        targetPlayer.effects = {};
    }
    if (targetPlayer.effects.freeze) {
        clearTimeout(targetPlayer.effects.freeze.timeoutId);
        if (targetPlayer.effects.freeze.visual && targetPlayer.effects.freeze.visual.destroy) {
            targetPlayer.effects.freeze.visual.destroy();
        }
    }

    const fx = scene.add.circle(targetPlayer.sprite.x, targetPlayer.sprite.y, 28, 0x9ee9ff, 0.18);
    fx.setStrokeStyle(2, 0xc9f6ff, 0.72);
    targetPlayer.sprite.setTint(0x9adfff);
    targetPlayer.effects.freeze = {
        visual: fx,
        timeoutId: setTimeout(() => {
            if (!targetPlayer || !targetPlayer.effects || !targetPlayer.effects.freeze) return;
            if (targetPlayer.effects.freeze.visual) {
                targetPlayer.effects.freeze.visual.destroy();
            }
            targetPlayer.effects.freeze = null;
            if (!(targetPlayer.effects && targetPlayer.effects.shield)) {
                targetPlayer.sprite.clearTint();
            }
        }, durationMs)
    };
}

function isPlayerFrozen(targetPlayer) {
    return Boolean(targetPlayer && targetPlayer.effects && targetPlayer.effects.freeze);
}

function addShieldEffect(scene, targetPlayer, playerId) {
    if (targetPlayer.effects && targetPlayer.effects.shield) {
        clearShieldEffect(targetPlayer);
    }

    const x = targetPlayer.sprite.x;
    const y = targetPlayer.sprite.y;
    
    const shieldOuter = scene.add.circle(x, y, 45, 0x00D4FF, 0.2);
    shieldOuter.setStrokeStyle(3, 0x00D4FF);
    
    const shieldInner = scene.add.circle(x, y, 42, 0x00A8E8, 0.1);
    shieldInner.setStrokeStyle(2, 0x00A8E8);
    
    const shieldTween = scene.tweens.add({
        targets: [shieldOuter, shieldInner],
        radius: 50,
        duration: 500,
        yoyo: true,
        repeat: -1
    });

    if (!targetPlayer.effects) {
        targetPlayer.effects = {};
    }
    targetPlayer.effects.shield = {
        visuals: [shieldOuter, shieldInner],
        tween: shieldTween
    };

    if (!isSinglePlayer && playerId !== socket.id) {
        otherPlayers[playerId].shielded = true;
    }
}

function updateEffectPositions(playerId, x, y) {
    const targetPlayer = (socket && playerId === socket.id) || playerId === 'player' ? player : otherPlayers[playerId];

    if (targetPlayer && targetPlayer.effects) {
        if (targetPlayer.effects.shield && Array.isArray(targetPlayer.effects.shield.visuals)) {
            targetPlayer.effects.shield.visuals.forEach(shield => {
                if (shield) shield.setPosition(x, y);
            });
        }
        if (targetPlayer.effects.freeze && targetPlayer.effects.freeze.visual) {
            targetPlayer.effects.freeze.visual.setPosition(x, y);
        }
    }
}

function clearShieldEffect(targetPlayer) {
    if (!targetPlayer || !targetPlayer.effects || !targetPlayer.effects.shield) {
        return;
    }
    const shield = targetPlayer.effects.shield;
    if (shield.tween) {
        shield.tween.stop();
    }
    if (Array.isArray(shield.visuals)) {
        shield.visuals.forEach((obj) => {
            if (obj && obj.destroy) obj.destroy();
        });
    }
    targetPlayer.effects.shield = null;
}

function updateCooldownDisplay() {
    const now = Date.now();

    ['dash', 'shield', 'freeze'].forEach(ability => {
        const btn = document.getElementById(`${ability}-btn`);
        const remaining = cooldowns[ability] - now;

        if (remaining > 0) {
            btn.classList.add('cooldown');
            let overlay = btn.querySelector('.cooldown-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'cooldown-overlay';
                btn.appendChild(overlay);
            }
            overlay.textContent = Math.ceil(remaining / 1000) + 's';
        } else {
            btn.classList.remove('cooldown');
            const overlay = btn.querySelector('.cooldown-overlay');
            if (overlay) overlay.remove();
        }
    });
}

function updateStatus(message) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.classList.remove('role-chaser', 'role-runner');
    if (message.includes('CHASER')) {
        statusEl.classList.add('role-chaser');
    } else if (message.includes('RUNNER')) {
        statusEl.classList.add('role-runner');
    }
}

function updatePlayerCount(count) {
    document.getElementById('player-count').textContent = `Players: ${count}`;
}
