// Get game configuration from index.html
const gameConfig = window.gameConfig || { character: 'ninja', mode: 'multi' };
const isSinglePlayer = gameConfig.mode === 'single';

// Only create socket for multiplayer
const socket = isSinglePlayer ? null : io();

const config = {
    type: Phaser.AUTO,
    width: 1400,
    height: 800,
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
    const baseColor = isChaser ? 0xff3333 : char.color;
    const outlineColor = isChaser ? 0xff0000 : 0x000000;

    // Head
    graphics.fillStyle(baseColor, 1);
    graphics.fillCircle(20, 10, 8);
    graphics.lineStyle(2, outlineColor, 1);
    graphics.strokeCircle(20, 10, 8);

    // Eyes
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(17, 8, 2);
    graphics.fillCircle(23, 8, 2);
    graphics.fillStyle(0x000000, 1);
    graphics.fillCircle(17, 8, 1);
    graphics.fillCircle(23, 8, 1);

    // Body/torso
    graphics.fillStyle(baseColor, 1);
    graphics.fillRect(15, 18, 10, 12);
    graphics.lineStyle(2, outlineColor, 1);
    graphics.strokeRect(15, 18, 10, 12);

    // Arms
    graphics.fillStyle(baseColor, 1);
    graphics.fillRect(10, 18, 5, 10);
    graphics.fillRect(25, 18, 5, 10);
    graphics.lineStyle(2, outlineColor, 1);
    graphics.strokeRect(10, 18, 5, 10);
    graphics.strokeRect(25, 18, 5, 10);

    // Legs
    graphics.fillStyle(baseColor, 1);
    graphics.fillRect(16, 30, 4, 10);
    graphics.fillRect(20, 30, 4, 10);
    graphics.lineStyle(2, outlineColor, 1);
    graphics.strokeRect(16, 30, 4, 10);
    graphics.strokeRect(20, 30, 4, 10);

    // Glow for chaser
    if (isChaser) {
        graphics.lineStyle(1, 0xff6666, 0.5);
        graphics.strokeCircle(20, 20, 18);
    }

    graphics.generateTexture(textureName, 40, 40);
    graphics.destroy();

    return textureName;
}

function createPlatforms(scene) {
    platforms = scene.physics.add.staticGroup();

    // Ground
    platforms.create(700, 780, null).setScale(1400 / 32, 40 / 32).refreshBody();
    
    // Platform styling - create ground
    const ground = scene.add.rectangle(700, 780, 1400, 40, 0x8B7355);
    const groundTop = scene.add.rectangle(700, 775, 1400, 5, 0xA0826D);

    // Left platform area
    const leftPlatform1 = platforms.create(200, 650, null).setScale(150 / 32, 20 / 32).refreshBody();
    scene.add.rectangle(200, 650, 150, 20, 0x8B7355);
    scene.add.rectangle(200, 642, 150, 5, 0xA0826D);

    const leftPlatform2 = platforms.create(250, 500, null).setScale(120 / 32, 20 / 32).refreshBody();
    scene.add.rectangle(250, 500, 120, 20, 0x8B7355);
    scene.add.rectangle(250, 492, 120, 5, 0xA0826D);

    const leftPlatform3 = platforms.create(150, 350, null).setScale(100 / 32, 20 / 32).refreshBody();
    scene.add.rectangle(150, 350, 100, 20, 0x8B7355);
    scene.add.rectangle(150, 342, 100, 5, 0xA0826D);

    // Center platforms
    const centerPlatform1 = platforms.create(700, 600, null).setScale(200 / 32, 20 / 32).refreshBody();
    scene.add.rectangle(700, 600, 200, 20, 0x8B7355);
    scene.add.rectangle(700, 592, 200, 5, 0xA0826D);

    const centerPlatform2 = platforms.create(700, 400, null).setScale(180 / 32, 20 / 32).refreshBody();
    scene.add.rectangle(700, 400, 180, 20, 0x8B7355);
    scene.add.rectangle(700, 392, 180, 5, 0xA0826D);

    // Right platform area
    const rightPlatform1 = platforms.create(1200, 650, null).setScale(150 / 32, 20 / 32).refreshBody();
    scene.add.rectangle(1200, 650, 150, 20, 0x8B7355);
    scene.add.rectangle(1200, 642, 150, 5, 0xA0826D);

    const rightPlatform2 = platforms.create(1150, 500, null).setScale(120 / 32, 20 / 32).refreshBody();
    scene.add.rectangle(1150, 500, 120, 20, 0x8B7355);
    scene.add.rectangle(1150, 492, 120, 5, 0xA0826D);

    const rightPlatform3 = platforms.create(1250, 350, null).setScale(100 / 32, 20 / 32).refreshBody();
    scene.add.rectangle(1250, 350, 100, 20, 0x8B7355);
    scene.add.rectangle(1250, 342, 100, 5, 0xA0826D);

    // Add sky background
    scene.add.rectangle(700, 200, 1400, 400, 0x87CEEB, 0.3);

    // Add clouds
    for (let i = 0; i < 5; i++) {
        const cloudX = Math.random() * 1400;
        const cloudY = Math.random() * 150 + 50;
        scene.add.circle(cloudX, cloudY, 20, 0xffffff, 0.7);
        scene.add.circle(cloudX + 25, cloudY, 25, 0xffffff, 0.7);
        scene.add.circle(cloudX + 50, cloudY, 20, 0xffffff, 0.7);
    }

    return platforms;
}

function create() {
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

    player.nameText = scene.add.text(100, 650, 'You', {
        fontSize: '16px',
        fill: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 5, y: 3 }
    }).setOrigin(0.5);

    scene.physics.add.collider(player.sprite, platforms);

    // Create AI players
    const aiCharTypes = ['robot', 'alien', 'wizard'];
    const aiPositions = [
        { x: 1300, y: 700 },
        { x: 700, y: 350 },
        { x: 300, y: 300 }
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

        const aiName = scene.add.text(aiPositions[index].x, aiPositions[index].y - 40, `AI ${index + 1}`, {
            fontSize: '16px',
            fill: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 5, y: 3 }
        }).setOrigin(0.5);

        scene.physics.add.collider(aiSprite, platforms);

        aiPlayers.push({
            sprite: aiSprite,
            character: charType,
            nameText: aiName,
            effects: {},
            isAI: true,
            isTagged: index === 0,
            targetX: aiPositions[index].x,
            targetY: aiPositions[index].y,
            thinkTimer: 0,
            canJump: false
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
            const effect = targetPlayer.effects[data.effect];
            if (Array.isArray(effect)) {
                effect.forEach(obj => obj && obj.destroy());
            } else if (effect && effect.destroy) {
                effect.destroy();
            }
            targetPlayer.effects[data.effect] = null;
        }
    });
}

function update() {
    if (!player) return;

    if (isSinglePlayer) {
        updateAI(this);
    }

    let velocityX = 0;
    isGrounded = player.sprite.body.touching.down;

    // Check if frozen
    if (player.effects && player.effects.freeze) {
        player.sprite.setVelocityX(0);
        return;
    }

    // Movement
    if (cursors.left.isDown || wasd.left.isDown) {
        velocityX = -playerSpeed;
        player.sprite.setFlip(true, false);
    } else if (cursors.right.isDown || wasd.right.isDown) {
        velocityX = playerSpeed;
        player.sprite.setFlip(false, false);
    }

    player.sprite.setVelocityX(velocityX);

    // Jumping
    if ((cursors.up.isDown || wasd.up.isDown) && isGrounded) {
        player.sprite.setVelocityY(-jumpPower);
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
    }

    updateCooldownDisplay();
}

function updateAI(scene) {
    aiPlayers.forEach((ai) => {
        if (!ai.sprite || !ai.sprite.active) return;

        const canJump = ai.sprite.body.touching.down;
        const distance = Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, ai.sprite.x, ai.sprite.y);

        ai.thinkTimer--;
        if (ai.thinkTimer <= 0) {
            if (ai.isTagged) {
                // Chase player
                if (player.sprite.x < ai.sprite.x) {
                    ai.sprite.setVelocityX(-ai.character === 'robot' ? 200 : 250);
                    ai.sprite.setFlip(true, false);
                } else {
                    ai.sprite.setVelocityX(ai.character === 'robot' ? 200 : 250);
                    ai.sprite.setFlip(false, false);
                }
                if (canJump && distance > 50) {
                    ai.sprite.setVelocityY(-jumpPower);
                }
            } else {
                // Flee
                if (ai.sprite.x > player.sprite.x) {
                    ai.sprite.setVelocityX(250);
                    ai.sprite.setFlip(false, false);
                } else {
                    ai.sprite.setVelocityX(-250);
                    ai.sprite.setFlip(true, false);
                }
                if (canJump && Math.random() > 0.7) {
                    ai.sprite.setVelocityY(-jumpPower);
                }
            }
            ai.thinkTimer = Phaser.Math.Between(30, 90);
        }

        if (ai.nameText) {
            ai.nameText.setPosition(ai.sprite.x, ai.sprite.y - 40);
        }
    });
}

function handleSinglePlayerTagging(scene) {
    aiPlayers.forEach((ai) => {
        if (!ai.sprite || !ai.sprite.active) return;

        const distance = Phaser.Math.Distance.Between(player.sprite.x, player.sprite.y, ai.sprite.x, ai.sprite.y);

        if (ai.isTagged && distance < 50) {
            ai.isTagged = false;
            isTagged = true;
            updatePlayerSprite(ai.sprite, ai.character, false);
            updatePlayerSprite(player.sprite, gameConfig.character, true);
            updateStatus('You are the CHASER! Tag the AI runners!');
        } else if (isTagged && !ai.isTagged && distance < 50) {
            isTagged = false;
            ai.isTagged = true;
            updatePlayerSprite(player.sprite, gameConfig.character, false);
            updatePlayerSprite(ai.sprite, ai.character, true);
            updateStatus('You are a RUNNER! Avoid the AI chaser!');
        }
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

    const nameText = scene.add.text(playerInfo.x, playerInfo.y - 40, playerInfo.username, {
        fontSize: '16px',
        fill: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 5, y: 3 }
    }).setOrigin(0.5);

    scene.physics.add.collider(sprite, platforms);

    if (isSelf) {
        player = {
            sprite: sprite,
            character: charType,
            nameText: nameText,
            effects: {}
        };
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
            const direction = player.sprite.flipX ? -1 : 1;
            player.sprite.setVelocityX(direction * 400);
            data = { direction: direction };
            cooldowns.dash = now + 5000;
            break;

        case 'shield':
            addShieldEffect(scene, player, socket ? socket.id : 'player');
            cooldowns.shield = now + 10000;
            setTimeout(() => {
                if (player.effects && player.effects.shield) {
                    const effect = player.effects.shield;
                    if (Array.isArray(effect)) {
                        effect.forEach(obj => obj && obj.destroy());
                    } else if (effect && effect.destroy) {
                        effect.destroy();
                    }
                    player.effects.shield = null;
                }
            }, 3000);
            break;

        case 'freeze':
            data = { radius: 150 };
            cooldowns.freeze = now + 15000;
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
                sprite.setVelocityX(dir * 400);
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
            break;
    }
}

function addShieldEffect(scene, targetPlayer, playerId) {
    if (targetPlayer.effects && targetPlayer.effects.shield) {
        targetPlayer.effects.shield.forEach(obj => obj.destroy());
    }

    const x = targetPlayer.sprite.x;
    const y = targetPlayer.sprite.y;
    
    const shieldOuter = scene.add.circle(x, y, 45, 0x00D4FF, 0.2);
    shieldOuter.setStrokeStyle(3, 0x00D4FF);
    
    const shieldInner = scene.add.circle(x, y, 42, 0x00A8E8, 0.1);
    shieldInner.setStrokeStyle(2, 0x00A8E8);
    
    scene.tweens.add({
        targets: [shieldOuter, shieldInner],
        radius: 50,
        duration: 500,
        yoyo: true,
        repeat: -1
    });

    if (!targetPlayer.effects) {
        targetPlayer.effects = {};
    }
    targetPlayer.effects.shield = [shieldOuter, shieldInner];

    if (!isSinglePlayer && playerId !== socket.id) {
        otherPlayers[playerId].shielded = true;
    }
}

function updateEffectPositions(playerId, x, y) {
    const targetPlayer = (socket && playerId === socket.id) || playerId === 'player' ? player : otherPlayers[playerId];

    if (targetPlayer && targetPlayer.effects) {
        if (targetPlayer.effects.shield && Array.isArray(targetPlayer.effects.shield)) {
            targetPlayer.effects.shield.forEach(shield => {
                if (shield) shield.setPosition(x, y);
            });
        }
    }
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
    document.getElementById('status').textContent = message;
}

function updatePlayerCount(count) {
    document.getElementById('player-count').textContent = `Players: ${count}`;
}
