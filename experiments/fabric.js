class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.oldX = x;
        this.oldY = y;
        this.originalX = x;  // Store original position for depth calculation
        this.originalY = y;
        this.pinned = false;
    }
   
    update(isSelected = false) {
        if (this.pinned || isSelected) return;
       
        const velX = (this.x - this.oldX) * 0.99; // damping
        const velY = (this.y - this.oldY) * 0.99;
       
        this.oldX = this.x;
        this.oldY = this.y;
       
        this.x += velX;
        this.y += velY + 0.05; // gravity (reduced from 0.5)
    }
}

class Spring {
    constructor(p1, p2) {
        this.p1 = p1;
        this.p2 = p2;
        this.restLength = Math.sqrt(
            Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
        );
        this.strength = 0.5;
    }
   
    update() {
        const dx = this.p2.x - this.p1.x;
        const dy = this.p2.y - this.p1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
       
        if (distance === 0) return;
       
        const difference = this.restLength - distance;
        const percent = (difference / distance) / 2;
        const offsetX = dx * percent * this.strength;
        const offsetY = dy * percent * this.strength;
       
        if (!this.p1.pinned) {
            this.p1.x -= offsetX;
            this.p1.y -= offsetY;
        }
        if (!this.p2.pinned) {
            this.p2.x += offsetX;
            this.p2.y += offsetY;
        }
    }
}

class FabricSimulation {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        document.getElementById('container').appendChild(this.canvas);
       
        this.particles = [];
        this.springs = [];
        this.selectedParticle = null;
        this.selectedParticles = []; // Array for multiple selected particles
        this.mouseX = 0;
        this.mouseY = 0;
        this.isIronMode = false;      // Track if we're in iron mode (Command held)
        this.isIronActive = false;   // Track if we're actively ironing (mouse down)
        this.ironedParticles = [];    // Track particles being ironed
        this.isStickyMode = false;    // Track if we're in sticky selection mode (Shift held)
        this.stickyParticles = [];    // Track particles in sticky selection
        this.isRepelMode = false;     // Track if we're in repel mode (Ctrl held)
        this.lastMouseX = 0;          // Track previous mouse position for velocity
        this.lastMouseY = 0;
        this.isDragging = false;      // Track if we're currently dragging particles
        this.imageData = null;        // Store processed image data
        this.imageCanvas = null;      // Hidden canvas for image processing
        this.imageCtx = null;
        this.imageWidth = 0;
        this.imageHeight = 0;
        this.imageDepthScale = 100;   // How much displacement the image creates
       
        // Gradient presets
        this.currentGradient = 0;
        this.gradients = [
            {
                name: "Rainbow",
                colors: [
                    { pos: 0.0, r: 0, g: 0, b: 255 },      // Blue
                    { pos: 0.2, r: 0, g: 255, b: 255 },    // Cyan
                    { pos: 0.4, r: 0, g: 255, b: 0 },      // Green
                    { pos: 0.6, r: 255, g: 255, b: 0 },    // Yellow
                    { pos: 0.8, r: 255, g: 128, b: 0 },    // Orange
                    { pos: 1.0, r: 255, g: 0, b: 0 }       // Red
                ]
            },
            {
                name: "Ocean",
                colors: [
                    { pos: 0.0, r: 0, g: 20, b: 40 },      // Deep blue
                    { pos: 0.3, r: 0, g: 100, b: 150 },    // Ocean blue
                    { pos: 0.6, r: 0, g: 180, b: 200 },    // Light blue
                    { pos: 0.8, r: 100, g: 220, b: 255 },  // Cyan
                    { pos: 1.0, r: 255, g: 255, b: 255 }   // White foam
                ]
            },
            {
                name: "Fire",
                colors: [
                    { pos: 0.0, r: 20, g: 0, b: 0 },       // Dark red
                    { pos: 0.3, r: 100, g: 0, b: 0 },      // Red
                    { pos: 0.6, r: 255, g: 100, b: 0 },    // Orange
                    { pos: 0.8, r: 255, g: 200, b: 0 },    // Yellow
                    { pos: 1.0, r: 255, g: 255, b: 200 }   // White hot
                ]
            },
            {
                name: "Forest",
                colors: [
                    { pos: 0.0, r: 10, g: 30, b: 10 },     // Dark green
                    { pos: 0.3, r: 50, g: 100, b: 50 },    // Forest green
                    { pos: 0.6, r: 100, g: 150, b: 50 },   // Olive
                    { pos: 0.8, r: 150, g: 200, b: 100 },  // Light green
                    { pos: 1.0, r: 200, g: 255, b: 150 }   // Bright green
                ]
            },
            {
                name: "Sunset",
                colors: [
                    { pos: 0.0, r: 25, g: 25, b: 50 },     // Deep purple
                    { pos: 0.25, r: 100, g: 50, b: 100 },  // Purple
                    { pos: 0.5, r: 200, g: 100, b: 50 },   // Orange
                    { pos: 0.75, r: 255, g: 150, b: 100 }, // Pink
                    { pos: 1.0, r: 255, g: 200, b: 150 }   // Light pink
                ]
            },
            {
                name: "Monochrome",
                colors: [
                    { pos: 0.0, r: 0, g: 0, b: 0 },        // Black
                    { pos: 0.25, r: 64, g: 64, b: 64 },    // Dark gray
                    { pos: 0.5, r: 128, g: 128, b: 128 },  // Gray
                    { pos: 0.75, r: 192, g: 192, b: 192 }, // Light gray
                    { pos: 1.0, r: 255, g: 255, b: 255 }   // White
                ]
            }
        ];
       
        // Visual customization properties
        this.dotSize = 10;           // Particle radius
        this.lineWidth = 1;         // Spring line thickness
        this.showLines = true;      // Show spring connections
        this.showFill = false;      // Fill cells between particles
        this.fillOpacity = 0.1;     // Cell fill transparency
        this.selectionRadius = 50;  // Radius for multi-particle selection
        this.useDepthColoring = true; // Enable depth-based coloring
        this.maxDepth = 50;         // Maximum depth for color scaling
       
        this.setupCanvas();
        this.createFabric();
        this.setupEvents();
        this.setupImageProcessing();
        this.animate();
    }
   
    getDepthColor(particle) {
        if (!this.useDepthColoring) {
            return particle.pinned ? '#ff4444' : '#ffffff';
        }
       
        // Calculate distance from original position
        const depth = Math.sqrt(
            Math.pow(particle.x - particle.originalX, 2) +
            Math.pow(particle.y - particle.originalY, 2)
        );
       
        // Use power scaling to emphasize large movements, but apply it to the cycle position
        const rawRatio = depth / this.maxDepth;
        const scaledDepth = Math.pow(rawRatio, 0.4);
       
        // Apply ping-pong cycling to the entire range
        const cycleLength = 2.0; // Two complete gradient cycles (forward + backward)
        const cyclePosition = (scaledDepth % cycleLength);
       
        let normalizedDepth;
        if (cyclePosition <= 1.0) {
            // Forward cycle: 0 -> 1
            normalizedDepth = cyclePosition;
        } else {
            // Backward cycle: 1 -> 0
            normalizedDepth = 2.0 - cyclePosition;
        }
       
        // Get current gradient
        const gradient = this.gradients[this.currentGradient];
       
        // Find the two colors to interpolate between
        let color1, color2, t;
       
        for (let i = 0; i < gradient.colors.length - 1; i++) {
            if (normalizedDepth >= gradient.colors[i].pos && normalizedDepth <= gradient.colors[i + 1].pos) {
                color1 = gradient.colors[i];
                color2 = gradient.colors[i + 1];
                // Calculate interpolation factor
                t = (normalizedDepth - color1.pos) / (color2.pos - color1.pos);
                break;
            }
        }
       
        // If we didn't find a range (shouldn't happen), use the last color
        if (!color1) {
            const lastColor = gradient.colors[gradient.colors.length - 1];
            return `rgb(${lastColor.r}, ${lastColor.g}, ${lastColor.b})`;
        }
       
        // Interpolate between the two colors
        const red = Math.floor(color1.r + (color2.r - color1.r) * t);
        const green = Math.floor(color1.g + (color2.g - color1.g) * t);
        const blue = Math.floor(color1.b + (color2.b - color1.b) * t);
       
        return `rgb(${red}, ${green}, ${blue})`;
    }
   
    setupImageProcessing() {
        // Create hidden canvas for image processing
        this.imageCanvas = document.createElement('canvas');
        this.imageCtx = this.imageCanvas.getContext('2d');
       
        // Setup drag and drop for images
        this.setupDragAndDrop();
    }
   
    setupDragAndDrop() {
        // Prevent default drag behaviors on the entire document
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
       
        // Add visual feedback for drag over
        document.addEventListener('dragenter', (e) => {
            document.body.style.backgroundColor = '#2a2a2a';
            document.body.style.border = '3px dashed #4CAF50';
        });
       
        document.addEventListener('dragleave', (e) => {
            // Only remove styling if we're leaving the document entirely
            if (e.clientX === 0 && e.clientY === 0) {
                document.body.style.backgroundColor = '#1a1a1a';
                document.body.style.border = 'none';
            }
        });
       
        document.addEventListener('drop', (e) => {
            // Remove visual feedback
            document.body.style.backgroundColor = '#1a1a1a';
            document.body.style.border = 'none';
           
            const files = Array.from(e.dataTransfer.files);
            const imageFile = files.find(file => file.type.startsWith('image/'));
           
            if (imageFile) {
                this.loadImage(imageFile);
            }
        });
    }
   
    loadImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.processImage(img);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
   
    processImage(img) {
        // Resize image to match fabric resolution
        this.imageWidth = this.cols;
        this.imageHeight = this.rows;
       
        this.imageCanvas.width = this.imageWidth;
        this.imageCanvas.height = this.imageHeight;
       
        // Draw and scale image to fabric size
        this.imageCtx.drawImage(img, 0, 0, this.imageWidth, this.imageHeight);
       
        // Get image data
        const imageData = this.imageCtx.getImageData(0, 0, this.imageWidth, this.imageHeight);
        this.imageData = imageData.data;
       
        // Apply image depth to fabric
        this.applyImageToFabric();
    }
   
    applyImageToFabric() {
        if (!this.imageData) return;
       
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const particleIndex = y * this.cols + x;
                const particle = this.particles[particleIndex];
               
                if (particle && !particle.pinned) {
                    // Get pixel data (RGBA)
                    const pixelIndex = (y * this.imageWidth + x) * 4;
                    const r = this.imageData[pixelIndex];
                    const g = this.imageData[pixelIndex + 1];
                    const b = this.imageData[pixelIndex + 2];
                   
                    // Convert to grayscale (brightness)
                    const brightness = (r + g + b) / 3;
                   
                    // Map brightness to depth (0-255 -> 0-imageDepthScale)
                    // Darker pixels = more displacement (deeper impression)
                    const depth = ((255 - brightness) / 255) * this.imageDepthScale;
                   
                    // Calculate new position based on original grid position
                    const originalGridX = x * (window.innerWidth / (this.cols - 1));
                    const originalGridY = y * (window.innerHeight / (this.rows - 1));
                   
                    // Apply displacement (push particles "into" the fabric)
                    const newX = originalGridX;
                    const newY = originalGridY + depth; // Displace downward
                   
                    // Update both current position AND original position
                    particle.x = newX;
                    particle.y = newY;
                    particle.oldX = newX;
                    particle.oldY = newY;
                    particle.originalX = newX; // Update original position so this becomes the new "rest" state
                    particle.originalY = newY;
                }
            }
        }
    }
   
    setupCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.canvas.style.display = 'block';
       
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
           
            // Recreate fabric to match new viewport
            this.particles = [];
            this.springs = [];
            this.selectedParticle = null;
            this.createFabric();
        });
    }
   
    createFabric() {
        // Calculate grid size based on viewport
        const cols = Math.floor(window.innerWidth / 15); // ~15px spacing
        const rows = Math.floor(window.innerHeight / 15);
       
        // Make spacing fill the viewport exactly
        const spacingX = window.innerWidth / (cols - 1);
        const spacingY = window.innerHeight / (rows - 1);
       
        // Create particles in a grid that fills the entire viewport
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const particle = new Particle(
                    x * spacingX,
                    y * spacingY
                );
               
                // Pin all edge particles
                if (y === 0 || y === rows - 1 || x === 0 || x === cols - 1) {
                    particle.pinned = true;
                }
               
                this.particles.push(particle);
            }
        }
       
        // Store dimensions for spring creation
        this.cols = cols;
        this.rows = rows;
       
        // Create springs
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const index = y * cols + x;
               
                // Horizontal springs
                if (x < cols - 1) {
                    this.springs.push(new Spring(
                        this.particles[index],
                        this.particles[index + 1]
                    ));
                }
               
                // Vertical springs
                if (y < rows - 1) {
                    this.springs.push(new Spring(
                        this.particles[index],
                        this.particles[index + cols]
                    ));
                }
               
                // Diagonal springs for stability
                if (x < cols - 1 && y < rows - 1) {
                    this.springs.push(new Spring(
                        this.particles[index],
                        this.particles[index + cols + 1]
                    ));
                }
               
                if (x > 0 && y < rows - 1) {
                    this.springs.push(new Spring(
                        this.particles[index],
                        this.particles[index + cols - 1]
                    ));
                }
            }
        }
    }
   
    setupEvents() {
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
           
            // Check modifier keys - separate Command and Ctrl
            const isIronMode = e.metaKey; // Only Command key for iron mode
            const isRepelMode = e.ctrlKey; // Only Ctrl key for repel mode
            const isStickyMode = e.shiftKey;
           
            if (isRepelMode) {
                // REPEL mode: Just set the flag, repelling happens in mousemove/update
                this.isRepelMode = true;
                return; // Don't start dragging in repel mode
            }
           
            if (isIronMode) {
                // IRON function: Hold particles at original positions
                this.isIronMode = true;
                this.isIronActive = true;
               
                // Only reset ironed particles if this is a fresh start
                if (this.ironedParticles.length === 0) {
                    this.ironedParticles = [];
                }
               
                this.particles.forEach(particle => {
                    if (particle.pinned) return; // Skip pinned particles
                   
                    const distance = Math.sqrt(
                        Math.pow(particle.x - this.mouseX, 2) +
                        Math.pow(particle.y - this.mouseY, 2)
                    );
                   
                    if (distance <= this.selectionRadius) {
                        if (!this.ironedParticles.includes(particle)) {
                            this.ironedParticles.push(particle);
                        }
                        // Move to original position and hold there
                        particle.x = particle.originalX;
                        particle.y = particle.originalY;
                        particle.oldX = particle.originalX;
                        particle.oldY = particle.originalY;
                    }
                });
                return; // Don't start dragging in iron mode
            }
           
            if (isStickyMode) {
                // STICKY selection mode: Add particles to sticky collection
                this.isStickyMode = true;
               
                this.particles.forEach(particle => {
                    if (particle.pinned) return; // Skip pinned particles
                   
                    const distance = Math.sqrt(
                        Math.pow(particle.x - this.mouseX, 2) +
                        Math.pow(particle.y - this.mouseY, 2)
                    );
                   
                    if (distance <= this.selectionRadius) {
                        // Add to sticky particles if not already there
                        if (!this.stickyParticles.some(sticky => sticky.particle === particle)) {
                            this.stickyParticles.push({
                                particle: particle,
                                offsetX: particle.x - this.mouseX,
                                offsetY: particle.y - this.mouseY
                            });
                        }
                    }
                });
                return; // Don't start normal dragging in sticky mode
            }
           
            // Normal drag mode: Find all particles within selection radius
            this.selectedParticles = [];
           
            this.particles.forEach(particle => {
                const distance = Math.sqrt(
                    Math.pow(particle.x - this.mouseX, 2) +
                    Math.pow(particle.y - this.mouseY, 2)
                );
               
                if (distance <= this.selectionRadius) {
                    this.selectedParticles.push({
                        particle: particle,
                        offsetX: particle.x - this.mouseX,
                        offsetY: particle.y - this.mouseY,
                        distance: distance
                    });
                }
            });
           
            if (this.selectedParticles.length > 0) {
                this.isDragging = true;
               
                // Set positions for all selected particles
                this.selectedParticles.forEach(selected => {
                    const targetX = this.mouseX + selected.offsetX;
                    const targetY = this.mouseY + selected.offsetY;
                   
                    selected.particle.x = targetX;
                    selected.particle.y = targetY;
                    selected.particle.oldX = targetX;
                    selected.particle.oldY = targetY;
                });
            }
        });
       
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.lastMouseX = this.mouseX; // Store previous position
            this.lastMouseY = this.mouseY;
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
           
            if (this.isIronMode && this.isIronActive) {
                // Iron mode: continuously iron particles under cursor only when actively ironing
                this.particles.forEach(particle => {
                    if (particle.pinned) return; // Skip pinned particles
                   
                    const distance = Math.sqrt(
                        Math.pow(particle.x - this.mouseX, 2) +
                        Math.pow(particle.y - this.mouseY, 2)
                    );
                   
                    if (distance <= this.selectionRadius) {
                        // Add to ironed particles if not already there
                        if (!this.ironedParticles.includes(particle)) {
                            this.ironedParticles.push(particle);
                        }
                        // Move to original position
                        particle.x = particle.originalX;
                        particle.y = particle.originalY;
                        particle.oldX = particle.originalX;
                        particle.oldY = particle.originalY;
                    }
                });
            } else if (this.isStickyMode && this.stickyParticles.length > 0) {
                // Sticky mode: move all sticky particles to follow cursor
                this.stickyParticles.forEach(sticky => {
                    const targetX = this.mouseX + sticky.offsetX;
                    const targetY = this.mouseY + sticky.offsetY;
                   
                    sticky.particle.x = targetX;
                    sticky.particle.y = targetY;
                    sticky.particle.oldX = targetX;
                    sticky.particle.oldY = targetY;
                });
            } else if (this.isDragging && this.selectedParticles.length > 0) {
                // Normal drag mode
                this.selectedParticles.forEach(selected => {
                    const targetX = this.mouseX + selected.offsetX;
                    const targetY = this.mouseY + selected.offsetY;
                   
                    selected.particle.x = targetX;
                    selected.particle.y = targetY;
                    selected.particle.oldX = targetX;
                    selected.particle.oldY = targetY;
                });
            }
        });
       
        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.selectedParticle = null;
            this.selectedParticles = [];
            this.isIronActive = false; // Stop actively ironing, but keep iron mode if Command still held
        });
       
        // Add global mouseup and mouseleave handlers to prevent stuck states
        document.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.selectedParticle = null;
            this.selectedParticles = [];
            this.isIronActive = false; // Stop actively ironing, but keep iron mode if Command still held
        });
       
        this.canvas.addEventListener('mouseleave', () => {
            this.isDragging = false;
            this.selectedParticle = null;
            this.selectedParticles = [];
            this.isIronActive = false; // Stop actively ironing, but keep iron mode if Command still held
        });
       
        // Handle context menu to prevent right-click issues
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.isDragging = false;
            this.selectedParticle = null;
            this.selectedParticles = [];
            this.isIronActive = false; // Stop actively ironing, but keep iron mode if Command still held
        });
       
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = touch.clientX - rect.left;
            this.mouseY = touch.clientY - rect.top;
           
            // For touch, we could use a two-finger tap for iron mode in the future
            // For now, just normal drag behavior
           
            // Find all particles within selection radius
            this.selectedParticles = [];
           
            this.particles.forEach(particle => {
                const distance = Math.sqrt(
                    Math.pow(particle.x - this.mouseX, 2) +
                    Math.pow(particle.y - this.mouseY, 2)
                );
               
                if (distance <= this.selectionRadius) {
                    this.selectedParticles.push({
                        particle: particle,
                        offsetX: particle.x - this.mouseX,
                        offsetY: particle.y - this.mouseY,
                        distance: distance
                    });
                }
            });
           
            if (this.selectedParticles.length > 0) {
                this.isDragging = true;
               
                // Set positions for all selected particles
                this.selectedParticles.forEach(selected => {
                    const targetX = this.mouseX + selected.offsetX;
                    const targetY = this.mouseY + selected.offsetY;
                   
                    selected.particle.x = targetX;
                    selected.particle.y = targetY;
                    selected.particle.oldX = targetX;
                    selected.particle.oldY = targetY;
                });
            }
        });
       
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.isDragging && this.selectedParticle) {
                const touch = e.touches[0];
                const rect = this.canvas.getBoundingClientRect();
                this.mouseX = touch.clientX - rect.left;
                this.mouseY = touch.clientY - rect.top;
               
                this.selectedParticle.x = this.mouseX;
                this.selectedParticle.y = this.mouseY;
                this.selectedParticle.oldX = this.mouseX;
                this.selectedParticle.oldY = this.mouseY;
            }
        });
       
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.isDragging = false;
            this.selectedParticle = null;
        });
       
        // Keyboard controls for visual customization
        document.addEventListener('keydown', (e) => {
            // Activate repel mode when Ctrl is pressed (without clicking)
            if (e.key === 'Control') {
                this.isRepelMode = true;
            }
           
            switch(e.key.toLowerCase()) {
                case ',': // Show help modal (but also decrease fill opacity)
                    document.getElementById('helpModal').style.display = 'flex';
                    this.fillOpacity = Math.max(this.fillOpacity - 0.05, 0.05);
                    break;
                case 'escape': // Emergency release
                    this.isDragging = false;
                    this.selectedParticle = null;
                    this.selectedParticles = [];
                    this.isIronMode = false;
                    this.isIronActive = false;
                    this.ironedParticles = [];
                    this.isStickyMode = false;
                    this.stickyParticles = [];
                    this.isRepelMode = false;
                    break;
                case 'q': // Decrease selection radius
                    this.selectionRadius = Math.max(this.selectionRadius - 5, 10);
                    break;
                case 'w': // Increase selection radius
                    this.selectionRadius = Math.min(this.selectionRadius + 5, 100);
                    break;
                case '3': // Toggle depth coloring
                    this.useDepthColoring = !this.useDepthColoring;
                    break;
                case 'r': // Decrease max depth
                    this.maxDepth = Math.max(this.maxDepth - 10, 20);
                    break;
                case 't': // Increase max depth
                    this.maxDepth = Math.min(this.maxDepth + 10, 200);
                    break;
                case 'i': // Iron function - reset all particles to original positions
                    this.particles.forEach(particle => {
                        if (!particle.pinned) {
                            particle.x = particle.originalX;
                            particle.y = particle.originalY;
                            particle.oldX = particle.originalX;
                            particle.oldY = particle.originalY;
                        }
                    });
                    break;
                case '1': // Toggle lines
                    this.showLines = !this.showLines;
                    break;
                case '2': // Toggle fill
                    this.showFill = !this.showFill;
                    break;
                case '=': // Increase dot size
                case '+':
                    this.dotSize = Math.min(this.dotSize + 1, 10);
                    break;
                case '-': // Decrease dot size
                    this.dotSize = Math.max(this.dotSize - 1, 1);
                    break;
                case '[': // Decrease line width
                    this.lineWidth = Math.max(this.lineWidth - 0.5, 0.5);
                    break;
                case ']': // Increase line width
                    this.lineWidth = Math.min(this.lineWidth + 0.5, 5);
                    break;
                case '.': // Increase fill opacity
                    this.fillOpacity = Math.min(this.fillOpacity + 0.05, 1);
                    break;
                case 'z': // Decrease image depth scale
                    this.imageDepthScale = Math.max(this.imageDepthScale - 10, 10);
                    if (this.imageData) this.applyImageToFabric();
                    break;
                case 'x': // Increase image depth scale
                    this.imageDepthScale = Math.min(this.imageDepthScale + 10, 300);
                    if (this.imageData) this.applyImageToFabric();
                    break;
                case 'c': // Clear image impression
                    this.imageData = null;
                    // Restore original grid positions
                    for (let y = 0; y < this.rows; y++) {
                        for (let x = 0; x < this.cols; x++) {
                            const particleIndex = y * this.cols + x;
                            const particle = this.particles[particleIndex];
                           
                            if (particle && !particle.pinned) {
                                const originalGridX = x * (window.innerWidth / (this.cols - 1));
                                const originalGridY = y * (window.innerHeight / (this.rows - 1));
                               
                                particle.x = originalGridX;
                                particle.y = originalGridY;
                                particle.oldX = originalGridX;
                                particle.oldY = originalGridY;
                                particle.originalX = originalGridX;
                                particle.originalY = originalGridY;
                            }
                        }
                    }
                    break;
                case 'g': // Next gradient
                    this.currentGradient = (this.currentGradient + 1) % this.gradients.length;
                    console.log(`Switched to gradient: ${this.gradients[this.currentGradient].name}`);
                    break;
                case 'f': // Previous gradient
                    this.currentGradient = (this.currentGradient - 1 + this.gradients.length) % this.gradients.length;
                    console.log(`Switched to gradient: ${this.gradients[this.currentGradient].name}`);
                    break;
            }
        });
       
        // Handle Command/Ctrl key release to exit iron mode
        document.addEventListener('keyup', (e) => {
            if (e.key === ',') {
                // Hide help modal when comma key is released
                document.getElementById('helpModal').style.display = 'none';
            } else if (e.key === 'Meta') { // Command key on Mac
                this.isIronMode = false;
                this.isIronActive = false;
                this.ironedParticles = []; // Release all ironed particles
            } else if (e.key === 'Control') { // Ctrl key
                this.isRepelMode = false; // Deactivate repel mode
            } else if (e.key === 'Shift') { // Shift key release
                this.isStickyMode = false;
                this.stickyParticles = []; // Release all sticky particles
            }
        });
    }
   
    update() {
        // Keep selected particles locked to cursor position
        if (this.selectedParticles.length > 0) {
            this.selectedParticles.forEach(selected => {
                const targetX = this.mouseX + selected.offsetX;
                const targetY = this.mouseY + selected.offsetY;
               
                selected.particle.x = targetX;
                selected.particle.y = targetY;
                selected.particle.oldX = targetX;
                selected.particle.oldY = targetY;
            });
        }
       
        // Keep sticky particles following cursor
        if (this.isStickyMode && this.stickyParticles.length > 0) {
            this.stickyParticles.forEach(sticky => {
                const targetX = this.mouseX + sticky.offsetX;
                const targetY = this.mouseY + sticky.offsetY;
               
                sticky.particle.x = targetX;
                sticky.particle.y = targetY;
                sticky.particle.oldX = targetX;
                sticky.particle.oldY = targetY;
            });
        }
       
        // Apply gentle repel force as default behavior (unless actively interacting)
        const isActivelyInteracting = this.isDragging || this.isIronMode || this.isStickyMode;
        if (!isActivelyInteracting) {
            // Calculate cursor velocity
            const cursorVelX = this.mouseX - this.lastMouseX;
            const cursorVelY = this.mouseY - this.lastMouseY;
            const cursorSpeed = Math.sqrt(cursorVelX * cursorVelX + cursorVelY * cursorVelY);
           
            // Only apply repel force if cursor is moving
            if (cursorSpeed > 0.5) { // Minimum movement threshold
                this.particles.forEach(particle => {
                    if (particle.pinned) return; // Skip pinned particles
                   
                    const dx = particle.x - this.mouseX;
                    const dy = particle.y - this.mouseY;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                   
                    if (distance < this.selectionRadius && distance > 0) {
                        // Calculate gentle repel force based on cursor speed
                        const repelStrength = 7; // Much gentler force
                        const speedMultiplier = Math.min(cursorSpeed / 10, 1); // Scale with cursor speed
                        const force = repelStrength * speedMultiplier * (this.selectionRadius - distance) / this.selectionRadius;
                       
                        // Normalize direction and apply gentle force
                        const dirX = dx / distance;
                        const dirY = dy / distance;
                       
                        // Apply force by adjusting the particle's previous position (affects velocity)
                        const forceX = dirX * force;
                        const forceY = dirY * force;
                       
                        particle.oldX -= forceX * 0.5; // Gentle velocity adjustment
                        particle.oldY -= forceY * 0.5;
                    }
                });
            }
        }
       
        // Keep ironed particles locked at original positions
        if (this.isIronMode && this.ironedParticles.length > 0) {
            this.ironedParticles.forEach(particle => {
                particle.x = particle.originalX;
                particle.y = particle.originalY;
                particle.oldX = particle.originalX;
                particle.oldY = particle.originalY;
            });
        }
       
        // Update springs multiple times for stability
        for (let i = 0; i < 3; i++) {
            this.springs.forEach(spring => spring.update());
        }
       
        // Update particles
        this.particles.forEach(particle => {
            const isSelected = this.selectedParticles.some(selected => selected.particle === particle);
            const isSticky = this.stickyParticles.some(sticky => sticky.particle === particle);
            const isIroned = this.ironedParticles.includes(particle);
            particle.update(isSelected || isSticky || isIroned);
        });
    }
   
    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
       
        // Draw cell fills if enabled
        if (this.showFill) {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${this.fillOpacity})`;
           
            for (let y = 0; y < this.rows - 1; y++) {
                for (let x = 0; x < this.cols - 1; x++) {
                    const topLeft = this.particles[y * this.cols + x];
                    const topRight = this.particles[y * this.cols + x + 1];
                    const bottomLeft = this.particles[(y + 1) * this.cols + x];
                    const bottomRight = this.particles[(y + 1) * this.cols + x + 1];
                   
                    // Draw quad as two triangles
                    this.ctx.beginPath();
                    this.ctx.moveTo(topLeft.x, topLeft.y);
                    this.ctx.lineTo(topRight.x, topRight.y);
                    this.ctx.lineTo(bottomRight.x, bottomRight.y);
                    this.ctx.lineTo(bottomLeft.x, bottomLeft.y);
                    this.ctx.closePath();
                    this.ctx.fill();
                }
            }
        }
       
        // Draw springs as lines if enabled
        if (this.showLines) {
            this.ctx.strokeStyle = '#444';
            this.ctx.lineWidth = this.lineWidth;
            this.ctx.beginPath();
           
            this.springs.forEach(spring => {
                this.ctx.moveTo(spring.p1.x, spring.p1.y);
                this.ctx.lineTo(spring.p2.x, spring.p2.y);
            });
           
            this.ctx.stroke();
        }
       
        // Draw particles
        this.particles.forEach(particle => {
            this.ctx.fillStyle = this.getDepthColor(particle);
           
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, this.dotSize, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
   
    animate() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

// Start the simulation
new FabricSimulation();