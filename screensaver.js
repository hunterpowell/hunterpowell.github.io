// Simple DVD logo bouncing screensaver
class DVDLogo {
    constructor(images, containerWidth, containerHeight) {
        this.width = 400;
        this.height = 200;
        this.containerWidth = containerWidth;
        this.containerHeight = containerHeight;
        this.images = images;
        this.currentImageIndex = 0;

        // Create DOM element
        this.element = document.createElement('img');
        this.element.src = this.images[this.currentImageIndex];
        this.element.className = 'screensaver-image';
        this.element.style.width = this.width + 'px';
        this.element.style.height = this.height + 'px';

        // Initial position - center of screen
        this.x = containerWidth / 2 - this.width / 2;
        this.y = containerHeight / 2 - this.height / 2;

        // Constant speed, random direction (2 or -2 like the Python version)
        const dir = [2, -2];
        this.dx = dir[Math.floor(Math.random() * 2)];
        this.dy = dir[Math.floor(Math.random() * 2)];

        this.updatePosition();
    }

    updatePosition() {
        this.element.style.left = this.x + 'px';
        this.element.style.top = this.y + 'px';
    }

    changeImage() {
        this.currentImageIndex = (this.currentImageIndex + 1) % this.images.length;
        this.element.src = this.images[this.currentImageIndex];
    }

    move() {
        // Update position
        this.x += this.dx;
        this.y += this.dy;

        let collision = false;

        // Bounce on collision with edges
        // Offset by 15 pixels to deal with transparent edges in the images
        if (this.x + this.width - 15 >= this.containerWidth) {
            this.dx = -this.dx;
            collision = true;
        }
        if (this.y + this.height - 13 >= this.containerHeight) {
            this.dy = -this.dy;
            collision = true;
        }
        if (this.x + 15 <= 0) {
            this.dx = -this.dx;
            collision = true;
        }
        if (this.y + 13 <= 0) {
            this.dy = -this.dy;
            collision = true;
        }

        // Change color on collision
        if (collision) {
            this.changeImage();
        }

        this.updatePosition();
    }
}

class FullscreenScreensaver {
    constructor(overlay, images) {
        this.overlay = overlay;
        this.images = images;
        this.running = false;
        this.logo = null;
        this.animationFrameId = null;

        // Get container dimensions
        this.width = window.innerWidth;
        this.height = window.innerHeight;
    }

    async start() {
        if (this.running) return;

        // Clean up any existing logo
        if (this.logo && this.logo.element && this.logo.element.parentNode) {
            this.logo.element.remove();
            this.logo = null;
        }

        // Create DVD logo
        this.logo = new DVDLogo(this.images, this.width, this.height);

        // Add element to overlay
        this.overlay.appendChild(this.logo.element);

        this.running = true;
        this.animate();
    }

    stop() {
        this.running = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }

        // Remove logo element
        if (this.logo && this.logo.element) {
            this.logo.element.remove();
            this.logo = null;
        }
    }

    animate() {
        if (!this.running) return;

        // Move logo
        this.logo.move();

        // Continue animation (roughly 60 FPS like the Python version)
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }
}
