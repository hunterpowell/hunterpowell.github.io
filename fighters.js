// Fighter class - represents a bouncing image/character
class Fighter {
    constructor(playerNum, canvasWidth, canvasHeight) {
        this.width = 60;
        this.height = 60;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;

        // Random speed
        this.speed = [100, 150, 200][Math.floor(Math.random() * 3)];

        this.score = 0;
        this.poweredUp = false;

        // Initial position based on player number
        if (playerNum === 1) {
            this.x = canvasWidth / 4 - this.width / 2;
            this.y = canvasHeight / 2 - this.height / 2;
            this.color = '#3b82f6'; // blue
            this.emoji = '🔵';
        } else {
            this.x = canvasWidth * 0.75 - this.width / 2;
            this.y = canvasHeight / 2 - this.height / 2;
            this.color = '#ef4444'; // red
            this.emoji = '🔴';
        }

        // Small variance in starting position
        this.x += Math.random() * 100 - 50;
        this.y += Math.random() * 100 - 50;

        // Random direction
        const dir = [this.speed, -this.speed];
        this.dx = dir[Math.floor(Math.random() * 2)];
        this.dy = dir[Math.floor(Math.random() * 2)];
    }

    updatePosition(deltaTime) {
        // Update position based on velocity and time
        this.x += this.dx * deltaTime;
        this.y += this.dy * deltaTime;

        let cornerHit = false;

        // Check boundaries
        const top = this.y + this.height >= this.canvasHeight;
        const right = this.x + this.width >= this.canvasWidth;
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

        return cornerHit;
    }

    draw(ctx) {
        // Draw fighter as emoji or colored circle
        if (this.poweredUp) {
            // Draw glow effect when powered up
            ctx.shadowBlur = 20;
            ctx.shadowColor = this.color;
        }

        // Draw circle
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(
            this.x + this.width / 2,
            this.y + this.height / 2,
            this.width / 2,
            0,
            2 * Math.PI
        );
        ctx.fill();

        // Draw emoji in center
        ctx.shadowBlur = 0;
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            this.emoji,
            this.x + this.width / 2,
            this.y + this.height / 2
        );

        // Draw score above fighter
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(
            this.score.toString(),
            this.x + this.width / 2,
            this.y - 10
        );
    }
}

// PowerUp class - represents collectible powerup
class PowerUp {
    constructor(canvasWidth, canvasHeight) {
        this.width = 30;
        this.height = 30;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.visible = true;
        this.reposition();
    }

    reposition() {
        const buffer = 60;
        this.x = Math.random() * (this.canvasWidth - 2 * buffer) + buffer;
        this.y = Math.random() * (this.canvasHeight - 2 * buffer) + buffer;
    }

    draw(ctx) {
        if (!this.visible) return;

        // Draw powerup as star emoji
        ctx.font = '25px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⭐', this.x + this.width / 2, this.y + this.height / 2);
    }
}

// Main FightersSimulation class
class FightersSimulation {
    constructor(canvas, statsCallback) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.statsCallback = statsCallback;
        this.running = false;

        this.canvasWidth = canvas.width;
        this.canvasHeight = canvas.height;

        this.fighter1 = new Fighter(1, this.canvasWidth, this.canvasHeight);
        this.fighter2 = new Fighter(2, this.canvasWidth, this.canvasHeight);
        this.powerUp = new PowerUp(this.canvasWidth, this.canvasHeight);

        this.highScore = 0;
        this.lastTime = performance.now();
        this.animationFrameId = null;
    }

    checkCombatCollision() {
        const f1 = this.fighter1;
        const f2 = this.fighter2;

        // AABB collision detection
        if (f1.x < f2.x + f2.width &&
            f1.x + f1.width > f2.x &&
            f1.y < f2.y + f2.height &&
            f1.y + f1.height > f2.y) {

            // Swap velocities
            [f1.dx, f2.dx] = [f2.dx, f1.dx];
            [f1.dy, f2.dy] = [f2.dy, f1.dy];

            // Determine winner
            let winner, loser;

            if (f1.poweredUp && !f2.poweredUp) {
                winner = f1;
                loser = f2;
            } else if (f2.poweredUp && !f1.poweredUp) {
                winner = f2;
                loser = f1;
            } else {
                // Random winner if both or neither have powerup
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
        const f1 = this.fighter1;
        const f2 = this.fighter2;

        // Check fighter 1 collision
        if (f1.x < p.x + p.width &&
            f1.x + f1.width > p.x &&
            f1.y < p.y + p.height &&
            f1.y + f1.height > p.y) {

            f1.poweredUp = true;
            this.powerUp.visible = false;
            setTimeout(() => this.respawnPowerUp(), 10000); // 10 seconds
        }
        // Check fighter 2 collision
        else if (f2.x < p.x + p.width &&
                 f2.x + f2.width > p.x &&
                 f2.y < p.y + p.height &&
                 f2.y + f2.height > p.y) {

            f2.poweredUp = true;
            this.powerUp.visible = false;
            setTimeout(() => this.respawnPowerUp(), 10000); // 10 seconds
        }
    }

    respawnPowerUp() {
        if (this.running) {
            this.powerUp.reposition();
            this.powerUp.visible = true;
        }
    }

    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#1e293b';
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        // Draw fighters
        this.fighter1.draw(this.ctx);
        this.fighter2.draw(this.ctx);

        // Draw powerup
        this.powerUp.draw(this.ctx);

        // Draw high score
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            `High Score: ${this.highScore}`,
            this.canvasWidth / 2,
            30
        );
    }

    animate() {
        if (!this.running) return;

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000; // Convert to seconds
        this.lastTime = currentTime;

        // Update fighter positions
        const f1Corner = this.fighter1.updatePosition(deltaTime);
        const f2Corner = this.fighter2.updatePosition(deltaTime);

        // Award points for corner hits
        if (f1Corner) this.fighter1.score += 5;
        if (f2Corner) this.fighter2.score += 5;

        // Check collisions
        this.checkCombatCollision();
        this.checkPowerUpCollision();

        // Update high score
        this.highScore = Math.max(this.highScore, this.fighter1.score, this.fighter2.score);

        // Update stats
        if (this.statsCallback) {
            this.statsCallback({
                player1Score: this.fighter1.score,
                player2Score: this.fighter2.score,
                highScore: this.highScore,
                running: this.running
            });
        }

        // Draw
        this.draw();

        // Continue animation loop
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.animate();
    }

    pause() {
        this.running = !this.running;
        if (this.running) {
            this.lastTime = performance.now();
            this.animate();
        } else if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    reset() {
        this.running = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        // Recreate fighters and powerup
        this.fighter1 = new Fighter(1, this.canvasWidth, this.canvasHeight);
        this.fighter2 = new Fighter(2, this.canvasWidth, this.canvasHeight);
        this.powerUp = new PowerUp(this.canvasWidth, this.canvasHeight);
        this.highScore = 0;

        // Clear canvas
        this.ctx.fillStyle = '#1e293b';
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

        // Update stats
        if (this.statsCallback) {
            this.statsCallback({
                player1Score: 0,
                player2Score: 0,
                highScore: 0,
                running: false
            });
        }
    }
}
