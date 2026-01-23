// DOM Elements
const dropzone = document.getElementById('dropzone');
const message = document.getElementById('message');
const canvas = document.getElementById('canvas');
const controls = document.getElementById('controls');
const fpsCounter = document.getElementById('fpsCounter');
const imageSelector = document.getElementById('imageSelector');

// Get WebGL context
const gl = canvas.getContext('webgl', { 
    preserveDrawingBuffer: true,
    antialias: false,
    alpha: false
}) || canvas.getContext('experimental-webgl', {
    preserveDrawingBuffer: true,
    antialias: false,
    alpha: false
});

if (!gl) {
    message.textContent = 'WebGL not supported!';
    throw new Error('WebGL not supported');
}

// UI Controls
const coordSystemSelect = document.getElementById('coordSystem');
const polarExtensionGroup = document.getElementById('polarExtensionGroup');
const polarExtensionSelect = document.getElementById('polarExtension');
const xAxisSelect = document.getElementById('xAxis');
const yAxisSelect = document.getElementById('yAxis');
const animationTypeSelect = document.getElementById('animationType');
const animateBtn = document.getElementById('animateBtn');
const xScrollSlider = document.getElementById('xScroll');
const yScrollSlider = document.getElementById('yScroll');
const xScrollValue = document.getElementById('xScrollValue');
const yScrollValue = document.getElementById('yScrollValue');
const xScrollAuto = document.getElementById('xScrollAuto');
const yScrollAuto = document.getElementById('yScrollAuto');
const xScrollDuration = document.getElementById('xScrollDuration');
const yScrollDuration = document.getElementById('yScrollDuration');
const downloadGifBtn = document.getElementById('downloadGifBtn');

// WebGL state
let program = null;
let colorBuffer = null;
let hslBuffer = null;
let pixelCount = 0;
let xOffset = 0;
let yOffset = 0;
let isAnimating = false;
let renderLoopId = null;

// Auto-scroll state
let xScrollStartTime = null;
let yScrollStartTime = null;
let xScrollStartValue = 0;
let yScrollStartValue = 0;

// FPS tracking
let frameCount = 0;
let lastFpsUpdate = performance.now();

// Formula mapping
const formulaMap = {
    'hue': 0,
    'saturation': 1,
    'lightness': 2,
    'red': 3,
    'green': 4,
    'blue': 5,
    'combined': 6,
    'original': 7
};

const coordSystemMap = {
    'cartesian': 0,
    'polar': 1
};

const polarExtensionMap = {
    'none': 0,
    'repeat': 1,
    'mirror': 2,
    'invert': 3
};

// RGB to HSL conversion
function rgbToHSL(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    let h = 0, s = 0, l = (max + min) / 2;
    
    if (delta !== 0) {
        s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
        
        if (max === r) {
            h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
        } else if (max === g) {
            h = ((b - r) / delta + 2) / 6;
        } else {
            h = ((r - g) / delta + 4) / 6;
        }
    }
    
    return { h, s, l };
}

// Initialize WebGL
function initWebGL() {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, 
        document.getElementById('vertex-shader').textContent);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER,
        document.getElementById('fragment-shader').textContent);
    
    program = createProgram(gl, vertexShader, fragmentShader);
    gl.useProgram(program);
    
    // Create buffers
    colorBuffer = gl.createBuffer();
    hslBuffer = gl.createBuffer();
}

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    
    return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    
    return program;
}

function render() {
    if (!program || !colorBuffer) return;
    
    renderDirect();
    
    // Update FPS
    frameCount++;
    const now = performance.now();
    if (now - lastFpsUpdate >= 1000) {
        const fps = Math.round(frameCount * 1000 / (now - lastFpsUpdate));
        fpsCounter.textContent = `FPS: ${fps}`;
        frameCount = 0;
        lastFpsUpdate = now;
    }
}

function renderDirect() {
    // Direct rendering without bloom (fallback)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.useProgram(program);
    
    // Update uniforms
    gl.uniform2f(gl.getUniformLocation(program, 'u_canvasSize'), canvas.width, canvas.height);
    gl.uniform1i(gl.getUniformLocation(program, 'u_xFormula'), formulaMap[xAxisSelect.value] || 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_yFormula'), formulaMap[yAxisSelect.value] || 6);
    gl.uniform1i(gl.getUniformLocation(program, 'u_coordSystem'), coordSystemMap[coordSystemSelect.value] || 1);
    gl.uniform1i(gl.getUniformLocation(program, 'u_polarExtension'), polarExtensionMap[polarExtensionSelect.value] || 3);
    gl.uniform1f(gl.getUniformLocation(program, 'u_xOffset'), xOffset);
    gl.uniform1f(gl.getUniformLocation(program, 'u_yOffset'), yOffset);
    
    // Bind buffers
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    const colorLoc = gl.getAttribLocation(program, 'a_color');
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, hslBuffer);
    const hslLoc = gl.getAttribLocation(program, 'a_hsl');
    gl.enableVertexAttribArray(hslLoc);
    gl.vertexAttribPointer(hslLoc, 3, gl.FLOAT, false, 0, 0);
    
    // Draw
    gl.drawArrays(gl.POINTS, 0, pixelCount);
}

function startRenderLoop() {
    if (renderLoopId) return;
    
    function loop() {
        // Update auto-scroll
        if (xScrollAuto.checked) {
            const duration = parseInt(xScrollDuration.value) || 300;
            const currentTime = performance.now();
            const totalElapsed = currentTime - xScrollStartTime;
            const unitsProgressed = totalElapsed / duration;
            let currentValue = xScrollStartValue + unitsProgressed;
            
            // Reset to 1% when reaching 100%
            if (currentValue >= 100) {
                xScrollStartTime = currentTime;
                xScrollStartValue = 1;
                currentValue = 1;
            }
            
            xScrollSlider.value = Math.round(currentValue);
            xOffset = currentValue / 100;
            xScrollValue.textContent = Math.round(currentValue) + '%';
        }
        
        if (yScrollAuto.checked) {
            const duration = parseInt(yScrollDuration.value) || 50;
            const currentTime = performance.now();
            const totalElapsed = currentTime - yScrollStartTime;
            const unitsProgressed = totalElapsed / duration;
            let currentValue = yScrollStartValue + unitsProgressed;
            
            // Reset to 1% when reaching 100%
            if (currentValue >= 100) {
                yScrollStartTime = currentTime;
                yScrollStartValue = 1;
                currentValue = 1;
            }
            
            yScrollSlider.value = Math.round(currentValue);
            yOffset = currentValue / 100;
            yScrollValue.textContent = Math.round(currentValue) + '%';
        }
        
        render();
        renderLoopId = requestAnimationFrame(loop);
    }
    
    loop();
}

function stopRenderLoop() {
    if (renderLoopId) {
        cancelAnimationFrame(renderLoopId);
        renderLoopId = null;
    }
}

// Event listeners
coordSystemSelect.addEventListener('change', () => {
    polarExtensionGroup.style.display = coordSystemSelect.value === 'polar' ? 'block' : 'none';
});

xScrollSlider.addEventListener('input', (e) => {
    xOffset = e.target.value / 100;
    xScrollValue.textContent = e.target.value + '%';
});

yScrollSlider.addEventListener('input', (e) => {
    yOffset = e.target.value / 100;
    yScrollValue.textContent = e.target.value + '%';
});

xScrollAuto.addEventListener('change', (e) => {
    if (e.target.checked) {
        xScrollStartTime = performance.now();
        const currentValue = parseFloat(xScrollSlider.value);
        xScrollStartValue = currentValue === 0 ? 1 : currentValue;
    }
});

yScrollAuto.addEventListener('change', (e) => {
    if (e.target.checked) {
        yScrollStartTime = performance.now();
        const currentValue = parseFloat(yScrollSlider.value);
        yScrollStartValue = currentValue === 0 ? 1 : currentValue;
    }
});

xScrollDuration.addEventListener('change', () => {
    if (xScrollAuto.checked) {
        xScrollStartTime = performance.now();
        xScrollStartValue = parseFloat(xOffset * 100);
    }
});

yScrollDuration.addEventListener('change', () => {
    if (yScrollAuto.checked) {
        yScrollStartTime = performance.now();
        yScrollStartValue = parseFloat(yOffset * 100);
    }
});

// Drag and drop handlers
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => {
        dropzone.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, () => {
        dropzone.classList.remove('dragover');
    }, false);
});

dropzone.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        return;
    }

    message.textContent = 'Processing...';

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            processImage(img);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function processImage(img) {
    // Set canvas to match viewport dimensions
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    // Read image data
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);
    const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;
    
    const totalPixels = img.width * img.height;
    
    // Pre-compute RGB and HSL data for all pixels
    const colorData = [];
    const hslData = [];
    
    for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const r = data[idx] / 255;
        const g = data[idx + 1] / 255;
        const b = data[idx + 2] / 255;
        
        const hsl = rgbToHSL(data[idx], data[idx + 1], data[idx + 2]);
        
        // Store normalized RGB
        colorData.push(r, g, b);
        
        // Store normalized HSL
        hslData.push(hsl.h, hsl.s, hsl.l);
    }
    
    pixelCount = totalPixels;
    
    // Upload to GPU buffers
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colorData), gl.STATIC_DRAW);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, hslBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(hslData), gl.STATIC_DRAW);
    
    // Hide image selector and show canvas
    if (imageSelector) {
        imageSelector.style.display = 'none';
    }
    message.style.display = 'none';
    canvas.style.display = 'block';
    controls.classList.add('visible');
    fpsCounter.classList.add('visible');
    
    // Start render loop
    startRenderLoop();
}

// Function to load image from assets using fetch
async function loadImageFromAssets(imagePath) {
    console.log('Loading image from assets:', imagePath);
    message.style.display = 'block';
    message.textContent = 'Loading...';
    
    try {
        // Fetch the image as a blob
        const response = await fetch(imagePath);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        
        // Create and load image
        const img = new Image();
        img.onload = () => {
            console.log('Image loaded successfully from assets');
            processImage(img);
            // Clean up the object URL
            URL.revokeObjectURL(imageUrl);
        };
        img.onerror = (error) => {
            console.error('Failed to load image:', error);
            message.style.display = 'block';
            message.textContent = 'Failed to load image';
            URL.revokeObjectURL(imageUrl);
        };
        img.src = imageUrl;
    } catch (error) {
        console.error('Error fetching image:', error);
        message.style.display = 'block';
        message.textContent = 'Failed to load image';
    }
}

// Image selector click handlers
if (imageSelector) {
    const imageOptions = imageSelector.querySelectorAll('.image-option');
    imageOptions.forEach(option => {
        option.addEventListener('click', () => {
            const imagePath = option.getAttribute('data-image');
            loadImageFromAssets(imagePath);
        });
    });
}

// Check URL parameters for UI visibility
const urlParams = new URLSearchParams(window.location.search);
const showUI = urlParams.get('ui') === 'true';

// Hide controls by default
if (!showUI) {
    controls.style.display = 'none';
    fpsCounter.style.display = 'none';
}

// Toggle UI with 'U' key
document.addEventListener('keydown', (e) => {
    if (e.key === 'u' || e.key === 'U') {
        const isHidden = controls.style.display === 'none';
        controls.style.display = isHidden ? 'block' : 'none';
        fpsCounter.style.display = isHidden ? 'block' : 'none';
    }
});

// Initialize WebGL on load
initWebGL();

// Hide message when image selector is visible
if (imageSelector) {
    message.style.display = 'none';
} else {
    message.textContent = 'WebGL Optimized - Drop image here';
}
