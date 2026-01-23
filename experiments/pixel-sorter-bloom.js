// Bloom post-processing implementation
// This file contains all bloom-related functions

// Initialize bloom system
function initBloom() {
    // Calculate bloom resolution (1/2 of canvas for higher quality)
    bloomWidth = Math.floor(canvas.width / 2);
    bloomHeight = Math.floor(canvas.height / 2);
    
    // Create framebuffer for main scene
    bloomFramebuffer = gl.createFramebuffer();
    bloomTexture = createTexture(canvas.width, canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bloomTexture, 0);
    
    // Create framebuffer for horizontal blur (at 1/4 res)
    blurHFramebuffer = gl.createFramebuffer();
    blurHTexture = createTexture(bloomWidth, bloomHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurHFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blurHTexture, 0);
    
    // Create framebuffer for vertical blur (at 1/4 res)
    blurVFramebuffer = gl.createFramebuffer();
    blurVTexture = createTexture(bloomWidth, bloomHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurVFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blurVTexture, 0);
    
    // Reset to default framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    // Create fullscreen quad for post-processing
    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const quadVertices = new Float32Array([
        -1, -1,  1, -1,  -1, 1,
        -1, 1,   1, -1,   1, 1
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    
    // Create bloom shader programs
    initBloomShaders();
}

function createTexture(width, height) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
}

function initBloomShaders() {
    // Simple vertex shader for fullscreen quad
    const quadVertexSource = `
        attribute vec2 a_position;
        varying vec2 v_texCoord;
        void main() {
            v_texCoord = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;
    
    // Extract bright pixels & downsample
    const extractFragmentSource = `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform float u_threshold;
        varying vec2 v_texCoord;
        void main() {
            vec4 color = texture2D(u_texture, v_texCoord);
            float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
            if (brightness > u_threshold) {
                gl_FragColor = color;
            } else {
                gl_FragColor = vec4(0.0);
            }
        }
    `;
    
    // Separable blur (horizontal or vertical)
    const blurFragmentSource = `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform vec2 u_direction;
        uniform vec2 u_resolution;
        varying vec2 v_texCoord;
        void main() {
            vec2 texelSize = 1.0 / u_resolution;
            vec4 result = vec4(0.0);
            // 9-tap Gaussian blur for wider, smoother glow
            result += texture2D(u_texture, v_texCoord + u_direction * texelSize * -4.0) * 0.0162;
            result += texture2D(u_texture, v_texCoord + u_direction * texelSize * -3.0) * 0.0540;
            result += texture2D(u_texture, v_texCoord + u_direction * texelSize * -2.0) * 0.1216;
            result += texture2D(u_texture, v_texCoord + u_direction * texelSize * -1.0) * 0.1945;
            result += texture2D(u_texture, v_texCoord) * 0.2270;
            result += texture2D(u_texture, v_texCoord + u_direction * texelSize * 1.0) * 0.1945;
            result += texture2D(u_texture, v_texCoord + u_direction * texelSize * 2.0) * 0.1216;
            result += texture2D(u_texture, v_texCoord + u_direction * texelSize * 3.0) * 0.0540;
            result += texture2D(u_texture, v_texCoord + u_direction * texelSize * 4.0) * 0.0162;
            gl_FragColor = result;
        }
    `;
    
    // Composite (add bloom to original)
    const compositeFragmentSource = `
        precision mediump float;
        uniform sampler2D u_scene;
        uniform sampler2D u_bloom;
        uniform float u_intensity;
        varying vec2 v_texCoord;
        void main() {
            vec4 scene = texture2D(u_scene, v_texCoord);
            vec4 bloom = texture2D(u_bloom, v_texCoord);
            gl_FragColor = scene + bloom * u_intensity;
        }
    `;
    
    // Compile shaders
    const quadVertex = createShader(gl, gl.VERTEX_SHADER, quadVertexSource);
    const extractFrag = createShader(gl, gl.FRAGMENT_SHADER, extractFragmentSource);
    const blurFrag = createShader(gl, gl.FRAGMENT_SHADER, blurFragmentSource);
    const compositeFrag = createShader(gl, gl.FRAGMENT_SHADER, compositeFragmentSource);
    
    // Create programs
    window.extractProgram = createProgram(gl, quadVertex, extractFrag);
    window.blurProgram = createProgram(gl, quadVertex, blurFrag);
    window.compositeProgram = createProgram(gl, quadVertex, compositeFrag);
}

function renderWithBloom() {
    if (!bloomFramebuffer) return render(); // Fallback if bloom not initialized
    
    // PASS 1: Render scene to framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFramebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    renderScene();
    
    // PASS 2: Extract bright pixels & downsample
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurHFramebuffer);
    gl.viewport(0, 0, bloomWidth, bloomHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND); // Disable blending for post-processing
    gl.useProgram(window.extractProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bloomTexture);
    gl.uniform1i(gl.getUniformLocation(window.extractProgram, 'u_texture'), 0);
    gl.uniform1f(gl.getUniformLocation(window.extractProgram, 'u_threshold'), 0.3); // Lower threshold = more bloom
    drawQuad(window.extractProgram);
    
    // PASS 3: Blur horizontally
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurVFramebuffer);
    gl.useProgram(window.blurProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, blurHTexture);
    gl.uniform1i(gl.getUniformLocation(window.blurProgram, 'u_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(window.blurProgram, 'u_direction'), 1.0, 0.0);
    gl.uniform2f(gl.getUniformLocation(window.blurProgram, 'u_resolution'), bloomWidth, bloomHeight);
    drawQuad(window.blurProgram);
    
    // PASS 4: Blur vertically
    gl.bindFramebuffer(gl.FRAMEBUFFER, blurHFramebuffer);
    gl.bindTexture(gl.TEXTURE_2D, blurVTexture);
    gl.uniform2f(gl.getUniformLocation(window.blurProgram, 'u_direction'), 0.0, 1.0);
    drawQuad(window.blurProgram);
    
    // PASS 5: Composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT); // Clear screen
    gl.useProgram(window.compositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bloomTexture);
    gl.uniform1i(gl.getUniformLocation(window.compositeProgram, 'u_scene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, blurHTexture);
    gl.uniform1i(gl.getUniformLocation(window.compositeProgram, 'u_bloom'), 1);
    gl.uniform1f(gl.getUniformLocation(window.compositeProgram, 'u_intensity'), glowIntensity);
    drawQuad(window.compositeProgram);
    
    // Re-enable blending for next frame
    gl.enable(gl.BLEND);
}

function renderScene() {
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
    gl.uniform1f(gl.getUniformLocation(program, 'u_glowIntensity'), glowIntensity);
    
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

function drawQuad(prog) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const posLoc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
