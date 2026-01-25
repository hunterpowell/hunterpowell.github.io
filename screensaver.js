// DOM-based screensaver - bouncing images overlay
class ScreensaverFighter {
    constructor(imageSrc, playerNum, containerWidth, containerHeight, imagePool = []) {
        this.width = 240;
        this.height = 240;
        this.containerWidth = containerWidth;
        this.containerHeight = containerHeight;
        this.playerNum = playerNum;
        this.imagePool = imagePool;
        this.currentImage = imageSrc;

        // Random speed
        this.speed = [150, 200, 250][Math.floor(Math.random() * 3)];

        this.score = 0;
        this.poweredUp = false;

        // Create DOM element
        this.element = document.createElement('img');
        this.element.src = imageSrc;
        this.element.className = 'screensaver-image';
        this.element.style.width = this.width + 'px';
        this.element.style.height = this.height + 'px';

        // Create score display
        this.scoreElement = document.createElement('div');
        this.scoreElement.className = 'screensaver-score';
        this.scoreElement.textContent = '0';

        // Initial position based on player number
        if (playerNum === 1) {
            this.x = containerWidth / 4 - this.width / 2;
            this.y = containerHeight / 2 - this.height / 2;
        } else {
            this.x = containerWidth * 0.75 - this.width / 2;
            this.y = containerHeight / 2 - this.height / 2;
        }

        // Small variance in starting position
        this.x += Math.random() * 100 - 50;
        this.y += Math.random() * 100 - 50;

        // Random direction
        const dir = [this.speed, -this.speed];
        this.dx = dir[Math.floor(Math.random() * 2)];
        this.dy = dir[Math.floor(Math.random() * 2)];

        this.updatePosition();
    }

    updatePosition() {
        this.element.style.left = this.x + 'px';
        this.element.style.top = this.y + 'px';
        this.scoreElement.style.left = (this.x + this.width / 2 - 20) + 'px';
        this.scoreElement.style.top = (this.y - 40) + 'px';
    }

    updateScore() {
        this.scoreElement.textContent = this.score.toString();
    }

    changeImage() {
        if (this.imagePool.length <= 1) return;

        let newImage;
        do {
            const randomIdx = Math.floor(Math.random() * this.imagePool.length);
            newImage = this.imagePool[randomIdx];
        } while (newImage === this.currentImage);

        this.currentImage = newImage;
        this.element.src = newImage;
    }

    move(deltaTime) {
        // Update position based on velocity and time
        this.x += this.dx * deltaTime;
        this.y += this.dy * deltaTime;

        let cornerHit = false;

        // Check boundaries
        const top = this.y + this.height >= this.containerHeight;
        const right = this.x + this.width >= this.containerWidth;
        const bottom = this.y <= 0;
        const left = this.x <= 0;

        // Bounce on collision with walls
        if (right) {
            this.dx = [-180, -150, -120][Math.floor(Math.random() * 3)];
            if (top || bottom) cornerHit = true;
        }
        if (top) {
            this.dy = [-180, -150, -120][Math.floor(Math.random() * 3)];
            if (left || right) cornerHit = true;
        }
        if (left) {
            this.dx = [120, 150, 180][Math.floor(Math.random() * 3)];
            if (top || bottom) cornerHit = true;
        }
        if (bottom) {
            this.dy = [120, 150, 180][Math.floor(Math.random() * 3)];
            if (left || right) cornerHit = true;
        }

        this.updatePosition();
        return cornerHit;
    }
}

class ScreensaverPowerUp {
    constructor(containerWidth, containerHeight) {
        this.width = 60;
        this.height = 60;
        this.containerWidth = containerWidth;
        this.containerHeight = containerHeight;
        this.visible = true;

        // Create DOM element
        this.element = document.createElement('div');
        this.element.className = 'screensaver-powerup';
        this.element.textContent = '⭐';

        this.reposition();
    }

    reposition() {
        const buffer = 120;
        this.x = Math.random() * (this.containerWidth - 2 * buffer) + buffer;
        this.y = Math.random() * (this.containerHeight - 2 * buffer) + buffer;
        this.updatePosition();
    }

    updatePosition() {
        this.element.style.left = this.x + 'px';
        this.element.style.top = this.y + 'px';
    }

    show() {
        this.visible = true;
        this.element.style.display = 'block';
    }

    hide() {
        this.visible = false;
        this.element.style.display = 'none';
    }
}

class FullscreenScreensaver {
    constructor(overlay, images) {
        this.overlay = overlay;
        this.images = images;
        this.running = false;
        this.fighters = [];
        this.powerUp = null;
        this.highScore = 0;
        this.lastTime = performance.now();
        this.animationFrameId = null;
        this.collisionCooldown = 0;

        // Get container dimensions
        this.width = window.innerWidth;
        this.height = window.innerHeight;
    }

    async start() {
        if (this.running) return;

        // Clean up any existing elements first
        if (this.fighters.length > 0) {
            this.fighters.forEach(f => {
                if (f.element && f.element.parentNode) f.element.remove();
                if (f.scoreElement && f.scoreElement.parentNode) f.scoreElement.remove();
            });
            this.fighters = [];
        }
        if (this.powerUp && this.powerUp.element && this.powerUp.element.parentNode) {
            this.powerUp.element.remove();
            this.powerUp = null;
        }

        // Reset high score
        this.highScore = 0;

        // Pick two random images (shuffle each time)
        const shuffled = [...this.images].sort(() => Math.random() - 0.5);
        const image1 = shuffled[0] || 'https://via.placeholder.com/240/3b82f6/ffffff?text=Player+1';
        const image2 = shuffled[1] || 'https://via.placeholder.com/240/ef4444/ffffff?text=Player+2';

        console.log('Starting screensaver with images:', image1, image2);

        // Create fighters
        this.fighters = [
            new ScreensaverFighter(image1, 1, this.width, this.height),
            new ScreensaverFighter(image2, 2, this.width, this.height)
        ];

        // Create powerup
        this.powerUp = new ScreensaverPowerUp(this.width, this.height);

        // Add elements to overlay
        this.overlay.appendChild(this.fighters[0].element);
        this.overlay.appendChild(this.fighters[0].scoreElement);
        this.overlay.appendChild(this.fighters[1].element);
        this.overlay.appendChild(this.fighters[1].scoreElement);
        this.overlay.appendChild(this.powerUp.element);

        this.running = true;
        this.lastTime = performance.now();
        this.animate();
    }

    stop() {
        this.running = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        // Remove all elements
        if (this.fighters.length > 0) {
            this.fighters.forEach(f => {
                f.element.remove();
                f.scoreElement.remove();
            });
            this.fighters = [];
        }

        if (this.powerUp) {
            this.powerUp.element.remove();
            this.powerUp = null;
        }
    }

    checkCollision(f1, f2) {
        // Collision cooldown check
        if (this.collisionCooldown && this.collisionCooldown > Date.now()) {
            return false;
        }

        // AABB collision detection
        if (f1.x < f2.x + f2.width &&
            f1.x + f1.width > f2.x &&
            f1.y < f2.y + f2.height &&
            f1.y + f1.height > f2.y) {

            // Set cooldown
            this.collisionCooldown = Date.now() + 500;

            // Swap velocities
            [f1.dx, f2.dx] = [f2.dx, f1.dx];
            [f1.dy, f2.dy] = [f2.dy, f1.dy];

            // Separate fighters
            const overlapX = (f1.width + f2.width) / 2 - Math.abs(f1.x + f1.width/2 - (f2.x + f2.width/2));
            const overlapY = (f1.height + f2.height) / 2 - Math.abs(f1.y + f1.height/2 - (f2.y + f2.height/2));

            if (overlapX < overlapY) {
                if (f1.x < f2.x) {
                    f1.x -= overlapX / 2;
                    f2.x += overlapX / 2;
                } else {
                    f1.x += overlapX / 2;
                    f2.x -= overlapX / 2;
                }
            } else {
                if (f1.y < f2.y) {
                    f1.y -= overlapY / 2;
                    f2.y += overlapY / 2;
                } else {
                    f1.y += overlapY / 2;
                    f2.y -= overlapY / 2;
                }
            }

            // Determine winner
            let winner, loser;
            if (f1.poweredUp && !f2.poweredUp) {
                winner = f1;
                loser = f2;
            } else if (f2.poweredUp && !f1.poweredUp) {
                winner = f2;
                loser = f1;
            } else {
                if (Math.random() < 0.5) {
                    winner = f1;
                    loser = f2;
                } else {
                    winner = f2;
                    loser = f1;
                }
            }

            // Update scores
            winner.score += 1;
            loser.score = 0;

            winner.updateScore();
            loser.updateScore();

            // Clear powerups
            f1.poweredUp = false;
            f2.poweredUp = false;

            return true;
        }

        return false;
    }

    checkPowerUpCollision() {
        if (!this.powerUp.visible) return;

        const p = this.powerUp;

        for (let f of this.fighters) {
            if (f.x < p.x + p.width &&
                f.x + f.width > p.x &&
                f.y < p.y + p.height &&
                f.y + f.height > p.y) {

                f.poweredUp = true;
                this.powerUp.hide();
                setTimeout(() => this.respawnPowerUp(), 10000);
                break;
            }
        }
    }

    respawnPowerUp() {
        if (this.running && this.powerUp) {
            this.powerUp.reposition();
            this.powerUp.show();
        }
    }

    updateHighScore() {
        this.highScore = Math.max(this.highScore, this.fighters[0].score, this.fighters[1].score);
        const highScoreEl = document.getElementById('screensaverHighScore');
        if (highScoreEl) {
            highScoreEl.textContent = `High Score: ${this.highScore}`;
        }
    }

    animate() {
        if (!this.running) return;

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        // Move fighters
        const f1Corner = this.fighters[0].move(deltaTime);
        const f2Corner = this.fighters[1].move(deltaTime);

        // Award corner hits
        if (f1Corner) {
            this.fighters[0].score += 5;
            this.fighters[0].updateScore();
        }
        if (f2Corner) {
            this.fighters[1].score += 5;
            this.fighters[1].updateScore();
        }

        // Check collisions
        this.checkCollision(this.fighters[0], this.fighters[1]);
        this.checkPowerUpCollision();

        // Update high score
        this.updateHighScore();

        // Continue animation
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }
}
