// ===== CONFIGURATION & CONSTANTS =====
const CONFIG = {
    dimensions: {
        defaultWidth: 800,
        defaultHeight: 630,
        minWidth: 300,
        minHeight: 200,
        titleBarHeight: 30
    },
    positioning: {
        overlapThreshold: 50,
        offsetIncrement: { x: 5, y: 10 },
        defaultOffset: 20,
        cascadeOffset: 80
    },
    zIndex: {
        base: 1000,
        increment: 1,
        fullscreenIncrement: 100
    }
};

// ===== GLOBAL STATE =====
const state = {
    isDragging: false,
    isResizing: false,
    dragTarget: null,
    resizeTarget: null,
    resizeType: null,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    initialWidth: 0,
    initialHeight: 0,
    containerCount: 0,
    topZIndex: CONFIG.zIndex.base,
    activeContainer: null
};

// ===== UTILITY FUNCTIONS =====
const utils = {
    preventSelection(enable) {
        document.body.classList.toggle('no-select', enable);
    },

    toggleIframePointerEvents(enable) {
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            iframe.classList.toggle('no-pointer-events', !enable);
        });
    },

    getEventCoordinates(e) {
        if (e.touches) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    },

    isInteractiveElement(tagName) {
        return ['A', 'IFRAME', 'BUTTON'].includes(tagName);
    },

    createButton(text, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        if (onClick) button.addEventListener('click', onClick);
        return button;
    }
};

// ===== URL STATE MANAGEMENT =====
const urlState = {
    update() {
        const openWindows = [];
        document.querySelectorAll('.iframe-container').forEach(container => {
            if (container.sourceLink) {
                openWindows.push({
                    title: container.sourceLink.textContent,
                    url: container.sourceLink.href,
                    x: parseInt(container.style.left),
                    y: parseInt(container.style.top),
                    width: parseInt(container.style.width),
                    height: parseInt(container.style.height),
                    isFullscreen: container.isFullscreen || false
                });
            }
        });
        
        const urlParams = new URLSearchParams();
        if (openWindows.length > 0) {
            urlParams.set('windows', JSON.stringify(openWindows));
        }
        
        const newURL = window.location.pathname + 
            (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', newURL);
    },

    restore() {
        const urlParams = new URLSearchParams(window.location.search);
        const windowsParam = urlParams.get('windows');
        
        if (!windowsParam) return;
        
        try {
            const windows = JSON.parse(windowsParam);
            windows.forEach(windowData => {
                const link = Array.from(document.querySelectorAll('.window-container a'))
                    .find(l => l.textContent === windowData.title && l.href === windowData.url);
                
                if (link) {
                    windowManager.create(windowData.url, windowData.title, link, windowData);
                }
            });
        } catch (e) {
            console.error('Error parsing window state from URL:', e);
        }
    }
};

// ===== POSITION MANAGEMENT =====
const positionManager = {
    findAvailablePosition() {
        const { defaultWidth, defaultHeight } = CONFIG.dimensions;
        let x = Math.round((window.innerWidth - defaultWidth) / 2);
        let y = Math.round((window.innerHeight - defaultHeight) / 2);
        
        const existingContainers = document.querySelectorAll('.iframe-container');
        if (existingContainers.length === 0) {
            return { x, y };
        }
        
        let positionTaken = true;
        let attempts = 0;
        const maxAttempts = 50;
        
        while (positionTaken && attempts < maxAttempts) {
            positionTaken = false;
            attempts++;
            
            for (const container of existingContainers) {
                const containerX = parseInt(container.style.left) || 0;
                const containerY = parseInt(container.style.top) || 0;
                
                if (this.hasOverlap(containerX, containerY, x, y)) {
                    positionTaken = true;
                    ({ x, y } = this.offsetPosition(x, y, defaultWidth, defaultHeight));
                    break;
                }
            }
        }
        
        return { x, y };
    },

    hasOverlap(x1, y1, x2, y2) {
        const threshold = CONFIG.positioning.overlapThreshold;
        return Math.abs(x1 - x2) < threshold && Math.abs(y1 - y2) < threshold;
    },

    offsetPosition(x, y, width, height) {
        const { offsetIncrement, defaultOffset, cascadeOffset } = CONFIG.positioning;
        x += offsetIncrement.x;
        y += offsetIncrement.y;
        
        if (x + width > window.innerWidth) {
            x = defaultOffset;
            y += cascadeOffset;
        }
        if (y + height > window.innerHeight) {
            y = defaultOffset;
            x += cascadeOffset;
        }
        
        return { x, y };
    }
};

// ===== OVERLAY MANAGEMENT =====
const overlayManager = {
    add(container) {
        if (container.querySelector('.iframe-overlay')) return;
        
        const overlay = document.createElement('div');
        overlay.className = 'iframe-overlay';
        overlay.addEventListener('mousedown', (e) => {
            windowManager.setActive(container);
            e.preventDefault();
        });
        
        container.appendChild(overlay);
    },

    remove(container) {
        const overlay = container.querySelector('.iframe-overlay');
        if (overlay) {
            container.removeChild(overlay);
        }
    }
};

// ===== WINDOW MANAGEMENT =====
const windowManager = {
    create(url, title, sourceLink, windowState = null) {
        state.containerCount++;
        
        const position = windowState ? 
            { x: windowState.x, y: windowState.y } : 
            positionManager.findAvailablePosition();
        
        const width = windowState?.width || CONFIG.dimensions.defaultWidth;
        const height = windowState?.height || CONFIG.dimensions.defaultHeight;
        
        const container = this.createContainer(position, width, height);
        this.storeContainerData(container, sourceLink, windowState, position, width, height);
        
        const titleBar = this.createTitleBar(title, container);
        const iframe = this.createIframe(url);
        
        container.appendChild(titleBar);
        container.appendChild(iframe);
        resizeManager.addHandles(container);
        
        document.body.appendChild(container);
        
        if (sourceLink) {
            sourceLink.classList.add('disabled');
        }
        
        this.setActive(container);
        dragManager.makeDraggable(container, titleBar);
        
        if (windowState?.isFullscreen) {
            this.applyFullscreen(container);
        }
        
        urlState.update();
        return container;
    },

    createContainer(position, width, height) {
        const container = document.createElement('div');
        container.className = 'iframe-container';
        container.style.cssText = `
            top: ${position.y}px;
            left: ${position.x}px;
            width: ${width}px;
            height: ${height}px;
            z-index: ${CONFIG.zIndex.base + state.containerCount};
        `;
        return container;
    },

    storeContainerData(container, sourceLink, windowState, position, width, height) {
        container.sourceLink = sourceLink;
        container.isFullscreen = windowState?.isFullscreen || false;
        container.originalX = position.x;
        container.originalY = position.y;
        container.originalWidth = width;
        container.originalHeight = height;
    },

    createTitleBar(title, container) {
        const titleBar = document.createElement('div');
        titleBar.className = 'title-bar';
        
        const titleText = document.createElement('span');
        titleText.textContent = title;
        
        const fullscreenButton = utils.createButton(
            container.isFullscreen ? '⧉' : '□',
            () => {
                this.toggleFullscreen(container, fullscreenButton);
                urlState.update();
            }
        );
        
        const closeButton = utils.createButton('X', () => {
            this.close(container);
        });
        
        titleBar.appendChild(titleText);
        titleBar.appendChild(fullscreenButton);
        titleBar.appendChild(closeButton);
        
        return titleBar;
    },

    createIframe(url) {
        const iframe = document.createElement('iframe');
        iframe.src = url;
        return iframe;
    },

    close(container) {
        if (container.sourceLink) {
            container.sourceLink.classList.remove('disabled');
        }
        document.body.removeChild(container);
        urlState.update();
    },

    setActive(container) {
        overlayManager.remove(container);
        
        document.querySelectorAll('.iframe-container').forEach(otherContainer => {
            if (otherContainer !== container) {
                overlayManager.add(otherContainer);
            }
        });
        
        state.activeContainer = container;
        this.bringToFront(container);
    },

    bringToFront(element) {
        if (element.className === 'iframe-container') {
            state.topZIndex += CONFIG.zIndex.increment;
            element.style.zIndex = state.topZIndex;
        }
    },

    toggleFullscreen(container, button) {
        if (container.isFullscreen) {
            this.restoreSize(container, button);
        } else {
            this.applyFullscreen(container, button);
        }
    },

    restoreSize(container, button) {
        container.style.left = container.originalX + 'px';
        container.style.top = container.originalY + 'px';
        container.style.width = container.originalWidth + 'px';
        container.style.height = container.originalHeight + 'px';
        if (button) button.textContent = '□';
        container.isFullscreen = false;
    },

    applyFullscreen(container, button) {
        if (!container.isFullscreen) {
            container.originalX = parseInt(container.style.left);
            container.originalY = parseInt(container.style.top);
            container.originalWidth = parseInt(container.style.width);
            container.originalHeight = parseInt(container.style.height);
        }
        
        container.style.left = '0px';
        container.style.top = '0px';
        container.style.width = window.innerWidth + 'px';
        container.style.height = window.innerHeight + 'px';
        if (button) button.textContent = '⧉';
        container.isFullscreen = true;
        
        state.topZIndex += CONFIG.zIndex.fullscreenIncrement;
        container.style.zIndex = state.topZIndex;
    }
};

// ===== DRAG MANAGEMENT =====
const dragManager = {
    makeDraggable(element, dragHandle) {
        const handle = dragHandle || element;
        
        handle.addEventListener('mousedown', (e) => this.handleStart(e, element));
        handle.addEventListener('touchstart', (e) => this.handleStart(e, element));
    },

    handleStart(e, element) {
        if (utils.isInteractiveElement(e.target.tagName)) return;
        
        if (element.className === 'iframe-container' && element.isFullscreen) {
            windowManager.setActive(element);
            return;
        }
        
        if (element.className === 'iframe-container') {
            windowManager.setActive(element);
        } else {
            windowManager.bringToFront(element);
        }
        
        state.isDragging = true;
        state.dragTarget = element;
        
        const coords = utils.getEventCoordinates(e);
        state.startX = coords.x;
        state.startY = coords.y;
        
        const rect = element.getBoundingClientRect();
        state.initialX = rect.left;
        state.initialY = rect.top;
        
        if (element.style.transform) {
            element.style.transform = 'none';
            element.style.left = state.initialX + 'px';
            element.style.top = state.initialY + 'px';
        }
        
        utils.preventSelection(true);
        utils.toggleIframePointerEvents(false);
        
        e.preventDefault();
    },

    handleMove(e) {
        if (!state.isDragging || !state.dragTarget) return;
        
        const coords = utils.getEventCoordinates(e);
        const deltaX = coords.x - state.startX;
        const deltaY = coords.y - state.startY;
        
        state.dragTarget.style.left = (state.initialX + deltaX) + 'px';
        state.dragTarget.style.top = (state.initialY + deltaY) + 'px';
    },

    handleEnd() {
        if (state.isDragging && state.dragTarget?.className === 'iframe-container') {
            urlState.update();
        }
        
        state.isDragging = false;
        state.dragTarget = null;
        
        utils.preventSelection(false);
        utils.toggleIframePointerEvents(true);
    }
};

// ===== RESIZE MANAGEMENT =====
const resizeManager = {
    addHandles(container) {
        if (container.querySelector('.resize-handle')) return;
        
        const handles = [
            { class: 'resize-n', type: 'n' },
            { class: 'resize-s', type: 's' },
            { class: 'resize-e', type: 'e' },
            { class: 'resize-w', type: 'w' },
            { class: 'resize-ne', type: 'ne' },
            { class: 'resize-nw', type: 'nw' },
            { class: 'resize-se', type: 'se' },
            { class: 'resize-sw', type: 'sw' }
        ];
        
        handles.forEach(handleInfo => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${handleInfo.class}`;
            container.appendChild(handle);
            this.makeResizable(container, handle, handleInfo.type);
        });
    },

    makeResizable(container, handle, type) {
        handle.addEventListener('mousedown', (e) => {
            if (container.isFullscreen) return;
            
            state.isResizing = true;
            state.resizeTarget = container;
            state.resizeType = type;
            
            const coords = utils.getEventCoordinates(e);
            state.startX = coords.x;
            state.startY = coords.y;
            
            state.initialWidth = parseInt(container.style.width);
            state.initialHeight = parseInt(container.style.height);
            state.initialX = parseInt(container.style.left);
            state.initialY = parseInt(container.style.top);
            
            windowManager.setActive(container);
            
            utils.preventSelection(true);
            utils.toggleIframePointerEvents(false);
            
            e.preventDefault();
            e.stopPropagation();
        });
    },

    handleMove(e) {
        if (!state.isResizing || !state.resizeTarget) return;
        
        const coords = utils.getEventCoordinates(e);
        const deltaX = coords.x - state.startX;
        const deltaY = coords.y - state.startY;
        
        const newDimensions = this.calculateNewDimensions(deltaX, deltaY);
        this.applyDimensions(state.resizeTarget, newDimensions);
    },

    calculateNewDimensions(deltaX, deltaY) {
        const { minWidth, minHeight } = CONFIG.dimensions;
        let newWidth = state.initialWidth;
        let newHeight = state.initialHeight;
        let newLeft = state.initialX;
        let newTop = state.initialY;
        
        const resizeCalculations = {
            n: () => {
                newHeight = Math.max(minHeight, state.initialHeight - deltaY);
                newTop = state.initialY + (state.initialHeight - newHeight);
            },
            s: () => {
                newHeight = Math.max(minHeight, state.initialHeight + deltaY);
            },
            e: () => {
                newWidth = Math.max(minWidth, state.initialWidth + deltaX);
            },
            w: () => {
                newWidth = Math.max(minWidth, state.initialWidth - deltaX);
                newLeft = state.initialX + (state.initialWidth - newWidth);
            },
            ne: () => {
                resizeCalculations.n();
                resizeCalculations.e();
            },
            nw: () => {
                resizeCalculations.n();
                resizeCalculations.w();
            },
            se: () => {
                resizeCalculations.s();
                resizeCalculations.e();
            },
            sw: () => {
                resizeCalculations.s();
                resizeCalculations.w();
            }
        };
        
        resizeCalculations[state.resizeType]();
        
        return { width: newWidth, height: newHeight, left: newLeft, top: newTop };
    },

    applyDimensions(container, dimensions) {
        container.style.width = dimensions.width + 'px';
        container.style.height = dimensions.height + 'px';
        container.style.left = dimensions.left + 'px';
        container.style.top = dimensions.top + 'px';
    },

    handleEnd() {
        const shouldUpdate = state.isResizing;
        
        state.isResizing = false;
        state.resizeTarget = null;
        state.resizeType = null;
        
        if (shouldUpdate) {
            urlState.update();
        }
    }
};

// ===== EVENT LISTENERS =====
document.addEventListener('mousemove', (e) => {
    resizeManager.handleMove(e);
    dragManager.handleMove(e);
});

document.addEventListener('touchmove', (e) => {
    resizeManager.handleMove(e);
    dragManager.handleMove(e);
});

document.addEventListener('mouseup', () => {
    resizeManager.handleEnd();
    dragManager.handleEnd();
});

document.addEventListener('touchend', () => {
    resizeManager.handleEnd();
    dragManager.handleEnd();
});

// ===== INITIALIZATION =====
dragManager.makeDraggable(document.getElementById('draggable-container'));

document.querySelectorAll('.window-container a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        if (link.classList.contains('disabled')) return;
        windowManager.create(link.href, link.textContent, link);
    });
});

window.addEventListener('load', () => {
    urlState.restore();
});
