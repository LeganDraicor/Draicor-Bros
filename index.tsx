/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// --- DOM ELEMENTS ---
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const highScoreEl = document.getElementById('high-score')!;
const messageOverlay = document.getElementById('message-overlay')!;
const messageTitle = document.getElementById('message-title')!;
const messageText = document.getElementById('message-text')!;

// Player UI elements
const p1ScoreEl = document.getElementById('p1-score')!;
const p1LivesEl = document.getElementById('p1-lives')!;
const p2Ui = document.getElementById('p2-ui')!;
const p2ScoreEl = document.getElementById('p2-score')!;
const p2LivesEl = document.getElementById('p2-lives')!;


// --- GAME CONSTANTS ---
const GAME_WIDTH = 960;
const GAME_HEIGHT = 720;
const GRAVITY = 0.6;
const PLAYER_SPEED = 5;
const PLAYER_JUMP = -15;
const ENEMY_SPEED = 1.5;
const FLIP_DURATION = 5000;
const HIGH_SCORE_KEY = 'retroArcadeHighScore';
const LIVES_START = 3;
const EXTRA_LIFE_SCORE = 20000;
const LEVEL_TRANSITION_TIME = 1500;
const EXPLOSIVE_BLOCK_USES = 3;

const spawnPoints = [
    { x: 150, y: 60 },
    { x: GAME_WIDTH - 150, y: 60 }
];

// --- GAME STATE ---
let highScore = parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0');
let level = 1;
let players: Player[] = [];
let enemies: Enemy[] = [];
let platforms: Platform[] = [];
let particles: Particle[] = [];
let explosiveBlock: ExplosiveBlock;
let keys: { [key: string]: boolean } = {};
let gameState: 'playerSelect' | 'playing' | 'gameOver' | 'levelTransition' | 'paused' = 'playerSelect';
let levelTransitionTimer = 0;
let playerSelectOption = 1;


// --- UTILITY FUNCTIONS ---
function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// --- CLASSES ---
class Player {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  onGround: boolean;
  sprite: string;
  onFrozenPlatform: boolean;
  controls: { left: string; right: string; jump: string };
  isDead: boolean;
  score: number;
  lives: number;
  nextExtraLifeScore: number;
  scoreEl: HTMLElement;
  livesEl: HTMLElement;

  constructor(id: number, controls: { left: string; right: string; jump: string; }, sprite: string) {
    this.id = id;
    this.width = 40;
    this.height = 40;
    this.x = GAME_WIDTH / 2 - this.width / 2 + (id === 1 ? -50 : 50);
    this.y = GAME_HEIGHT - this.height - 50;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.sprite = sprite;
    this.onFrozenPlatform = false;
    this.controls = controls;
    this.isDead = false;

    this.score = 0;
    this.lives = LIVES_START;
    this.nextExtraLifeScore = EXTRA_LIFE_SCORE;

    this.scoreEl = document.getElementById(`p${id}-score`)!;
    this.livesEl = document.getElementById(`p${id}-lives`)!;
  }

  draw() {
    if(this.isDead) return;
    ctx.font = '40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.sprite, this.x + this.width / 2, this.y + this.height / 2);
  }

  update() {
    if(this.isDead) return;
    // Horizontal movement
    if (this.onFrozenPlatform) {
        if (!keys[this.controls.left] && !keys[this.controls.right]) {
            this.vx *= 0.97; // friction
            if (Math.abs(this.vx) < 0.1) this.vx = 0;
        } else {
             if (keys[this.controls.left]) this.vx = -PLAYER_SPEED;
             if (keys[this.controls.right]) this.vx = PLAYER_SPEED;
        }
    } else {
        this.vx = 0;
        if (keys[this.controls.left]) this.vx = -PLAYER_SPEED;
        if (keys[this.controls.right]) this.vx = PLAYER_SPEED;
    }
    this.x += this.vx;

    // Screen wrap
    if (this.x < -this.width) this.x = GAME_WIDTH;
    if (this.x > GAME_WIDTH) this.x = -this.width;

    // Vertical movement
    this.vy += GRAVITY;
    this.y += this.vy;
    this.onGround = false;
    this.onFrozenPlatform = false;
  }

  jump() {
    if (this.onGround && !this.isDead) {
      this.vy = PLAYER_JUMP;
    }
  }

  die() {
    if(this.isDead) return;
    this.lives--;
    updateUI();
    for (let i = 0; i < 50; i++) {
        particles.push(new Particle(this.x + this.width / 2, this.y + this.height / 2, this.sprite));
    }

    if (this.lives <= 0) {
        this.isDead = true;
        checkGameOver();
    } else {
        // Respawn player
        this.x = GAME_WIDTH / 2 - this.width / 2;
        this.y = GAME_HEIGHT - this.height - 100;
        this.vx = 0;
        this.vy = 0;
    }
  }

   addScore(points: number) {
    this.score += points;
    if (this.score >= this.nextExtraLifeScore) {
        this.lives++;
        this.nextExtraLifeScore += EXTRA_LIFE_SCORE;
    }

    if (this.score > highScore) {
        highScore = this.score;
        localStorage.setItem(HIGH_SCORE_KEY, highScore.toString());
    }
    updateUI();
  }
}

class Enemy {
    x: number;
    y: number;
    width: number;
    height: number;
    vx: number;
    vy: number;
    sprite: string;
    isFlipped: boolean;
    flipTimer: number;
    onGround: boolean;
    hitAnimationTimer: number;

    constructor(x: number, y: number, width: number, height: number, sprite: string) {
        this.width = width;
        this.height = height;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.sprite = sprite;
        this.isFlipped = false;
        this.flipTimer = 0;
        this.onGround = false;
        this.hitAnimationTimer = 0;
    }

    draw() {
        ctx.save();
        if (this.hitAnimationTimer > 0 && Math.floor(this.hitAnimationTimer / 50) % 2 === 0) {
            ctx.restore();
            return;
        }
        if (this.isFlipped) {
            ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
            ctx.rotate(Math.PI);
            ctx.translate(-(this.x + this.width / 2), -(this.y + this.height / 2));
        }
        ctx.font = '36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.sprite, this.x + this.width / 2, this.y + this.height / 2);
        ctx.restore();
    }

    update() {
        if (this.hitAnimationTimer > 0) this.hitAnimationTimer -= 1000 / 60;

        if (this.isFlipped) {
            this.flipTimer -= 1000 / 60;
            if (this.flipTimer <= 0) {
                this.isFlipped = false;
                this.y -= 5;
            }
        }

        // Horizontal screen exit -> respawn at top
        if (this.x + this.width < 0 || this.x > GAME_WIDTH) {
            const spawnPoint = spawnPoints[randomInt(0, spawnPoints.length - 1)];
            this.x = spawnPoint.x;
            this.y = spawnPoint.y;
            this.vy = 0;
        }

        this.vy += GRAVITY;
        this.y += this.vy;
        this.onGround = false;


        platforms.forEach(p => {
            // Collision with all platforms, including floor
            if (this.x < p.x + p.width && this.x + this.width > p.x &&
                this.y + this.height >= p.y && this.y + this.height <= p.y + p.height + 10 && this.vy >= 0) {
                this.y = p.y - this.height;
                this.vy = 0;
                this.onGround = true;
                if (!p.isFloor) { 
                    this.x += p.vx;
                }
            }
        });
    }

    flip() {
        if (!this.isFlipped) {
            this.isFlipped = true;
            this.flipTimer = FLIP_DURATION;
            this.vy = -5;
        }
    }
}

class BasicEnemy extends Enemy {
    constructor(x: number, y: number) {
        super(x, y, 36, 36, '👾');
        this.vx = (Math.random() < 0.5 ? 1 : -1) * ENEMY_SPEED;
    }
    update() {
        super.update();
        if (!this.isFlipped) this.x += this.vx;
    }
}

class FastEnemy extends Enemy {
    constructor(x: number, y: number) {
        super(x, y, 36, 36, '👻');
        this.vx = (Math.random() < 0.5 ? 1 : -1) * ENEMY_SPEED * 1.8;
    }
    update() {
        super.update();
        if (!this.isFlipped) this.x += this.vx;
    }
}

class JumpingEnemy extends Enemy {
    jumpCooldown: number;
    constructor(x: number, y: number) {
        super(x, y, 36, 36, '👽');
        this.vx = (Math.random() < 0.5 ? 1 : -1) * ENEMY_SPEED * 0.8;
        this.jumpCooldown = randomInt(80, 200);
    }
    update() {
        super.update();
        this.jumpCooldown--;
        if (this.onGround && this.jumpCooldown <= 0 && !this.isFlipped) {
            this.vy = -8;
            this.onGround = false;
            this.jumpCooldown = randomInt(100, 300);
        }
        if (!this.isFlipped) this.x += this.vx;
    }
}

class IceBomberEnemy extends Enemy {
    timer: number;
    platform: Platform | null;
    constructor(x: number, y: number, platform: Platform) {
        super(x, y, 36, 36, '💣');
        this.vx = 0;
        this.timer = randomInt(3000, 5000);
        this.platform = platform;
        this.y = platform.y - this.height;
        this.x = platform.x + (platform.width / 2) - (this.width / 2);
    }
    update() {
        super.update();
        this.timer -= 1000 / 60;
        if (this.timer <= 0 && !this.isFlipped) {
            this.explode();
        }
        if (this.platform) {
            this.x = this.platform.x + (this.platform.width / 2) - (this.width / 2);
        }
    }
    explode() {
        const index = enemies.indexOf(this);
        if (index > -1) enemies.splice(index, 1);
        for (let i = 0; i < 40; i++) particles.push(new Particle(this.x, this.y, this.sprite));
        if (this.platform) this.platform.freeze();
    }
    flip() {
        this.timer = Math.min(this.timer, 100);
    }
}

class ToughEnemy extends Enemy {
    hitsLeft: number;
    constructor(x: number, y: number) {
        super(x, y, 40, 40, '👹');
        this.vx = (Math.random() < 0.5 ? 1 : -1) * ENEMY_SPEED * 0.7;
        this.hitsLeft = 2;
    }
    flip() {
        if (this.isFlipped) return;
        this.hitsLeft--;
        this.vy = -3;
        if (this.hitsLeft <= 0) {
            super.flip();
        } else {
            this.hitAnimationTimer = 300;
            this.sprite = '👺';
        }
    }
    update() {
        super.update();
        if (!this.isFlipped) this.x += this.vx;
    }
}


class Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  isFloor: boolean;
  isFrozen: boolean;
  frozenTimer: number;
  vx: number;
  startX: number;
  range: number;

  constructor(x: number, y: number, width: number, height = 20, isFloor = false) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.color = '#0074D9';
    this.isFloor = isFloor;
    this.isFrozen = false;
    this.frozenTimer = 0;
    this.vx = 0;
    this.startX = x;
    this.range = 0;
  }

  draw() {
    ctx.fillStyle = this.isFrozen ? '#7FDBFF' : this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }

  update() {
      if(this.isFrozen) {
          this.frozenTimer -= 1000/60;
          if(this.frozenTimer <= 0) this.isFrozen = false;
      }
      if (this.vx !== 0) {
          this.x += this.vx;
          if (this.x <= this.startX || this.x >= this.startX + this.range) {
              this.vx *= -1;
          }
      }
  }

  freeze() {
      this.isFrozen = true;
      this.frozenTimer = 7000;
  }

  makeMobile(speed: number, range: number) {
      this.vx = speed;
      this.range = range;
      if (speed < 0) {
          this.startX = this.x - range;
      }
      return this;
  }
}

class ExplosiveBlock {
    x: number;
    y: number;
    width: number;
    height: number;
    initialHeight: number;
    usesLeft: number;
    cooldown: number;
    
    constructor() {
        this.width = 50;
        this.initialHeight = 50;
        this.height = this.initialHeight;
        this.x = GAME_WIDTH / 2 - this.width / 2;
        this.y = GAME_HEIGHT - 180;
        this.usesLeft = EXPLOSIVE_BLOCK_USES;
        this.cooldown = 0;
    }
    
    draw() {
        if (this.usesLeft <= 0) return;

        ctx.save();
        if (this.cooldown > 0) ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ff4136';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        ctx.fillStyle = '#fff';
        ctx.font = '30px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('B', this.x + this.width / 2, this.y + this.height / 2 + 2);
        ctx.restore();
    }

    update() {
        if (this.cooldown > 0) this.cooldown -= 1000/60;
    }

    hit() {
        if (this.usesLeft > 0 && this.cooldown <= 0) {
            this.usesLeft--;
            this.cooldown = 500;
            enemies.forEach(e => e.flip());
            for (let i = 0; i < 50; i++) {
                particles.push(new Particle(this.x + this.width / 2, this.y, '💥'));
            }
            // Flattening effect
            const flattenAmount = this.initialHeight / EXPLOSIVE_BLOCK_USES;
            this.height -= flattenAmount;
            this.y += flattenAmount;
        }
    }

    reset() {
        this.usesLeft = EXPLOSIVE_BLOCK_USES;
        this.height = this.initialHeight;
        this.y = GAME_HEIGHT - 180;
    }
}

class Particle {
    x: number;
    y: number;
    size: number;
    vx: number;
    vy: number;
    sprite: string;
    life: number;
    isEmoji: boolean;

    constructor(x: number, y: number, sprite: string) {
        this.x = x;
        this.y = y;
        this.sprite = sprite;
        this.isEmoji = /\p{Emoji}/u.test(sprite);
        this.size = this.isEmoji ? 20 : Math.random() * 5 + 2;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.life = 100;
    }

    draw() {
        ctx.globalAlpha = this.life / 100;
        if (this.isEmoji) {
            ctx.font = `${this.size}px sans-serif`;
            ctx.fillText(this.sprite, this.x, this.y);
        } else {
            ctx.fillStyle = this.sprite;
            ctx.fillRect(this.x, this.y, this.size, this.size);
        }
        ctx.globalAlpha = 1.0;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += GRAVITY * 0.1;
        this.life--;
        if(this.isEmoji && this.size > 0.2) this.size -= 0.2;
    }
}

const levelLayouts = [
    () => [
        new Platform(0, 550, 250),
        new Platform(GAME_WIDTH - 250, 550, 250),
        new Platform(300, 400, 360),
        new Platform(0, 250, 350),
        new Platform(GAME_WIDTH - 350, 250, 350),
    ],
    () => [
        new Platform(0, 580, 200),
        new Platform(GAME_WIDTH - 200, 580, 200),
        new Platform(250, 450, 150),
        new Platform(GAME_WIDTH - 400, 450, 150),
        new Platform(0, 300, 200),
        new Platform(GAME_WIDTH - 200, 300, 200),
        new Platform(300, 180, 360),
    ],
    () => [
        new Platform(0, 550, 200),
        new Platform(GAME_WIDTH - 200, 550, 200),
        new Platform(380, 400, 200).makeMobile(1, 100),
        new Platform(0, 250, 300),
        new Platform(GAME_WIDTH - 300, 250, 300),
    ],
     () => [
        new Platform(0, 580, 150).makeMobile(1.2, 80),
        new Platform(GAME_WIDTH - 150, 580, 150).makeMobile(-1.2, 80),
        new Platform(300, 420, 360),
        new Platform(0, 250, 350).makeMobile(1.5, 150),
        new Platform(GAME_WIDTH - 350, 250, 350).makeMobile(-1.5, 150),
    ],
];

function startGame(numPlayers: number) {
    level = 1;
    players = [];
    const p1Controls = { left: 'a', right: 'd', jump: 'w' };
    players.push(new Player(1, p1Controls, '🤖'));

    if (numPlayers === 2) {
        const p2Controls = { left: 'arrowleft', right: 'arrowright', jump: 'arrowup' };
        players.push(new Player(2, p2Controls, '🧑‍🚀'));
        p2Ui.classList.remove('hidden');
    } else {
        p2Ui.classList.add('hidden');
    }

    explosiveBlock = new ExplosiveBlock();
    setupLevel(level);
    updateUI();
    gameState = 'playing';
}

function setupLevel(levelNum: number) {
  const layoutIndex = Math.floor((levelNum -1) / 4) % levelLayouts.length;
  platforms = [
    new Platform(0, GAME_HEIGHT - 40, GAME_WIDTH, 40, true),
    ...levelLayouts[layoutIndex](),
  ];
  platforms.forEach(p => { p.isFrozen = false; }); // Unfreeze platforms on new level
  enemies = [];
  explosiveBlock.reset();
  
  const finalLevel = Math.min(levelNum, 50);
  const enemyCount = 2 + Math.floor(finalLevel / 2);

  for (let i = 0; i < enemyCount; i++) {
    const spawnPoint = spawnPoints[randomInt(0, spawnPoints.length - 1)];
    const x = spawnPoint.x;
    const y = spawnPoint.y;

    let enemyType = Math.random();
    
    if (finalLevel >= 25 && enemyType < 0.15) {
         enemies.push(new ToughEnemy(x, y));
    } else if (finalLevel >= 20 && enemyType < 0.3) {
        const validPlatforms = platforms.filter(p => !p.isFloor && p.vx === 0 && !enemies.some(e => e instanceof IceBomberEnemy && e.platform === p));
        if (validPlatforms.length > 0) {
           const platformForBomber = validPlatforms[randomInt(0, validPlatforms.length - 1)];
           enemies.push(new IceBomberEnemy(0, 0, platformForBomber));
        } else {
            enemies.push(new BasicEnemy(x,y));
        }
    } else if (finalLevel >= 10 && enemyType < 0.5) {
        enemies.push(new JumpingEnemy(x, y));
    } else if (finalLevel >= 5 && enemyType < 0.75) {
        enemies.push(new FastEnemy(x, y));
    } else {
        enemies.push(new BasicEnemy(x, y));
    }
  }
}

function update() {
    if (gameState === 'playing') {
        players.forEach(p => p.update());
        enemies.forEach(e => e.update());
        platforms.forEach(p => p.update());
        explosiveBlock.update();
        handleCollisions();
        if (enemies.length === 0 && players.some(p => !p.isDead)) {
            level++;
            gameState = 'levelTransition';
            levelTransitionTimer = LEVEL_TRANSITION_TIME;
        }
    } else if (gameState === 'levelTransition') {
        levelTransitionTimer -= 1000 / 60;
        if (levelTransitionTimer <= 0) {
            setupLevel(level);
            gameState = 'playing';
        }
    }
  particles.forEach(p => p.update());
  particles = particles.filter(p => p.life > 0);
}

function handleCollisions() {
    players.forEach(player => {
        if(player.isDead) return;

        // Player vs Explosive Block (as a platform)
        const block = explosiveBlock;
        if (block.usesLeft > 0 &&
            player.x < block.x + block.width && player.x + player.width > block.x &&
            player.y + player.height >= block.y && player.y + player.height <= block.y + 10 + player.vy && player.vy >= 0) {
            player.y = block.y - player.height;
            player.vy = 0;
            player.onGround = true;
        }

        // Player vs Platforms
        let onAnyPlatform = player.onGround;
        let isCurrentlyOnFrozenPlatform = false;
        platforms.forEach(p => {
            if (player.x < p.x + p.width && player.x + player.width > p.x &&
                player.y + player.height >= p.y && player.y + player.height <= p.y + p.height + player.vy && player.vy >= 0) {
                player.y = p.y - player.height;
                player.vy = 0;
                player.onGround = true;
                onAnyPlatform = true;
                if (p.isFrozen) isCurrentlyOnFrozenPlatform = true;
                player.x += p.vx;
            }

            if (player.x < p.x + p.width && player.x + player.width > p.x &&
                player.y > p.y && player.y <= p.y + p.height && player.vy < 0) {
                player.y = p.y + p.height;
                player.vy = 0;
                const hitCenterX = player.x + player.width / 2;
                enemies.forEach(enemy => {
                     const onThisPlatform = Math.abs((enemy.y + enemy.height) - p.y) < 10;
                     const withinHitRange = enemy.x < hitCenterX + 20 && (enemy.x + enemy.width) > hitCenterX - 20;
                    if (!enemy.isFlipped && onThisPlatform && withinHitRange) {
                        enemy.flip();
                        player.addScore(50);
                    }
                });
            }
        });
        player.onGround = onAnyPlatform;
        player.onFrozenPlatform = isCurrentlyOnFrozenPlatform;

        // Player vs Explosive Block (hitting from below)
        if (player.x < block.x + block.width && player.x + player.width > block.x &&
            player.y > block.y && player.y <= block.y + block.height && player.vy < 0) {
            player.y = block.y + block.height;
            player.vy = 0;
            block.hit();
        }

        // Player vs Enemies
        enemies.forEach((enemy, index) => {
            if (player.x < enemy.x + enemy.width && player.x + player.width > enemy.x &&
                player.y < enemy.y + enemy.height && player.y + player.height > enemy.y) {
                if (enemy.isFlipped) {
                    enemies.splice(index, 1);
                    for (let i = 0; i < 20; i++) particles.push(new Particle(enemy.x, enemy.y, enemy.sprite));
                    player.addScore(200);
                } else {
                    player.die();
                }
            }
        });
    });

    // Enemy vs Enemy
    for (let i = 0; i < enemies.length; i++) {
        for (let j = i + 1; j < enemies.length; j++) {
            const e1 = enemies[i];
            const e2 = enemies[j];
            if (e1.x < e2.x + e2.width && e1.x + e1.width > e2.x &&
                e1.y < e2.y + e2.height && e1.y + e1.height > e2.y) {
                if (!e1.isFlipped && !e2.isFlipped && e1.onGround && e2.onGround) {
                    // Swap velocities for a better bounce effect
                    const tempVx = e1.vx;
                    e1.vx = e2.vx;
                    e2.vx = tempVx;

                    // Give a slight push to prevent sticking
                     if (e1.x < e2.x) {
                        e1.x -= 1;
                        e2.x += 1;
                    } else {
                        e1.x += 1;
                        e2.x -= 1;
                    }
                }
            }
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    if (gameState === 'playerSelect') {
        drawPlayerSelect();
    } else {
        platforms.forEach(p => p.draw());
        explosiveBlock.draw();
        enemies.forEach(e => e.draw());
        players.forEach(p => p.draw());
        
        if (gameState === 'paused') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
            ctx.fillStyle = 'white';
            ctx.font = '50px "Press Start 2P"';
            ctx.textAlign = 'center';
            ctx.fillText('PAUSED', GAME_WIDTH / 2, GAME_HEIGHT / 2);
        } else if (gameState === 'levelTransition') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
            ctx.fillStyle = 'white';
            ctx.font = '50px "Press Start 2P"';
            ctx.textAlign = 'center';
            ctx.fillText(`LEVEL ${level}`, GAME_WIDTH / 2, GAME_HEIGHT / 2);
        } else if (gameState === 'gameOver') {
            drawGameOver();
        }
    }
     particles.forEach(p => p.draw());
}

function drawPlayerSelect() {
    ctx.textAlign = 'center';
    // Shadow
    ctx.fillStyle = '#ff4136'; // Red shadow
    ctx.font = '80px "Press Start 2P"';
    ctx.fillText('DRAICOR BROS', GAME_WIDTH / 2 + 5, GAME_HEIGHT / 2 - 150 + 5);
    // Main Text
    ctx.fillStyle = '#ffdc00'; // Yellow text
    ctx.fillText('DRAICOR BROS', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 150);


    ctx.fillStyle = 'white';
    ctx.font = '40px "Press Start 2P"';
    ctx.fillText('SELECT PLAYERS', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50);

    ctx.font = '30px "Press Start 2P"';
    ctx.fillStyle = playerSelectOption === 1 ? '#ffdc00' : 'white';
    ctx.fillText('1 PLAYER', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30);

    ctx.fillStyle = playerSelectOption === 2 ? '#ffdc00' : 'white';
    ctx.fillText('2 PLAYERS', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 90);

    ctx.font = '20px "Press Start 2P"';
    ctx.fillStyle = 'white';
    ctx.fillText('Use Arrow Keys and Enter', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 180);
}

function drawGameOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.fillStyle = '#ff4136';
    ctx.font = '60px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50);

    ctx.fillStyle = 'white';
    ctx.font = '20px "Press Start 2P"';
    ctx.fillText('Press Enter to return to menu', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50);
}


function checkGameOver() {
    const allPlayersDead = players.every(p => p.isDead);
    if(allPlayersDead) {
        gameState = 'gameOver';
    }
}

function updateUI() {
    highScoreEl.textContent = highScore.toString().padStart(6, '0');
    if (players[0]) {
        p1ScoreEl.textContent = players[0].score.toString().padStart(6, '0');
        p1LivesEl.textContent = players[0].lives.toString();
    }
    if (players[1]) {
        p2ScoreEl.textContent = players[1].score.toString().padStart(6, '0');
        p2LivesEl.textContent = players[1].lives.toString();
    }
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

// --- EVENT LISTENERS ---
window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    keys[key] = true;
    
    if (gameState === 'playing') {
        if (key === 'w' || key === ' ') players.find(p => p.id === 1)?.jump();
        if (key === 'arrowup') players.find(p => p.id === 2)?.jump();
        if (key === 'enter') gameState = 'paused';
        
    } else if (gameState === 'paused') {
        // Debounce Enter key for pausing/unpausing
        if (key === 'enter') setTimeout(() => {
            if (keys['enter']) gameState = 'playing';
        }, 100);

    } else if (gameState === 'playerSelect') {
        if (key === 'arrowdown') playerSelectOption = 2;
        if (key === 'arrowup') playerSelectOption = 1;
        if (key === 'enter') startGame(playerSelectOption);

    } else if (gameState === 'gameOver') {
        if (key === 'enter') {
            gameState = 'playerSelect';
            p2Ui.classList.add('hidden'); // Hide p2 UI on return to menu
        }
    }
});

window.addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false;
});

// --- START GAME ---
updateUI();
gameLoop();
