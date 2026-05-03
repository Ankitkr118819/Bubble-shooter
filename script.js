const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('nextBubbleCanvas');
const nextCtx = nextCanvas.getContext('2d');

const scoreEl = document.getElementById('score');
const gameOverModal = document.getElementById('gameOverModal');
const finalScoreEl = document.getElementById('finalScore');
const restartBtn = document.getElementById('restartBtn');
const modalTitle = document.getElementById('modalTitle');

// Game Constants
const BUBBLE_COLORS = ['#ff007f', '#00f2fe', '#f9d423', '#7b2cbf', '#00e676'];
const BUBBLE_RADIUS = 20;
const ROW_HEIGHT = BUBBLE_RADIUS * Math.sqrt(3);
const SPEED = 15;
const ROWS = 12;
const COLS = 10;
const MAX_ROWS = 20;

// Game State
let bubbles = [];
let particles = [];
let currentBubble = null;
let nextBubbleColor = '';
let score = 0;
let shotsFired = 0;
let rowOffset = 0; 
let isGameOver = false;
let mouseX = 0;
let mouseY = 0;

// Resize handling
function resize() {
    const wrapper = document.querySelector('.canvas-wrapper');
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
    // Calculate how many columns can fit, but we'll stick to a fixed logical grid
    // centered in the canvas.
}

window.addEventListener('resize', resize);
resize(); // Initial sizing
// Audio Context
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function playPopSound() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
}

// Math Helpers
function getGridX(r, c) {
    const xOffset = (canvas.width - (COLS * BUBBLE_RADIUS * 2)) / 2 + BUBBLE_RADIUS;
    const staggeredOffset = (r % 2 === 0) ? 0 : BUBBLE_RADIUS;
    return xOffset + c * BUBBLE_RADIUS * 2 + staggeredOffset;
}

function getGridY(r) {
    return BUBBLE_RADIUS + r * ROW_HEIGHT + (rowOffset * ROW_HEIGHT);
}

function dist(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

// Bubble Class
class Bubble {
    constructor(r, c, color, x, y) {
        this.r = r;
        this.c = c;
        this.color = color;
        // If x, y are provided (projectile), use them, else calculate from grid
        this.x = x !== undefined ? x : getGridX(r, c);
        this.y = y !== undefined ? y : getGridY(r);
        this.vx = 0;
        this.vy = 0;
        this.isMoving = false;
        this.isDropping = false;
        this.dropVy = 0;
        this.popping = false;
        this.popScale = 1;
        this.popAlpha = 1;
    }

    draw(ctx) {
        if (this.popping) {
            ctx.save();
            ctx.globalAlpha = this.popAlpha;
            ctx.beginPath();
            ctx.arc(this.x, this.y, BUBBLE_RADIUS * this.popScale, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.restore();
            return;
        }

        ctx.beginPath();
        ctx.arc(this.x, this.y, BUBBLE_RADIUS - 1, 0, Math.PI * 2);
        
        // Gradient for 3D sphere look
        const grad = ctx.createRadialGradient(this.x - 5, this.y - 5, 2, this.x, this.y, BUBBLE_RADIUS);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.2, this.color);
        grad.addColorStop(1, '#000000');
        
        ctx.fillStyle = grad;
        ctx.fill();
        
        // Highlight reflection
        ctx.beginPath();
        ctx.arc(this.x - 6, this.y - 6, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fill();
    }

    update() {
        if (this.popping) {
            this.popScale += 0.1;
            this.popAlpha -= 0.1;
            return;
        }

        if (this.isMoving) {
            this.x += this.vx;
            this.y += this.vy;

            // Wall bounce
            const leftBound = (canvas.width - (COLS * BUBBLE_RADIUS * 2)) / 2 + BUBBLE_RADIUS;
            const rightBound = canvas.width - leftBound + BUBBLE_RADIUS;

            if (this.x < leftBound || this.x > rightBound) {
                this.vx *= -1;
                this.x = Math.max(leftBound, Math.min(this.x, rightBound));
            }
        } else if (this.isDropping) {
            this.dropVy += 0.5; // Gravity
            this.y += this.dropVy;
        } else {
            // Update position based on grid (in case rowOffset changes)
            if (this.r !== undefined && this.c !== undefined) {
                const targetX = getGridX(this.r, this.c);
                const targetY = getGridY(this.r);
                this.x += (targetX - this.x) * 0.2; // Smooth transition
                this.y += (targetY - this.y) * 0.2;
            }
        }
    }
}

// Particle System for pops
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.life = 1;
        this.decay = Math.random() * 0.05 + 0.02;
        this.size = Math.random() * 5 + 2;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= this.decay;
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function createParticles(x, y, color) {
    for (let i = 0; i < 15; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function getRandomColor() {
    return BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)];
}

// Initialize Grid
function initGrid() {
    bubbles = [];
    rowOffset = 0;
    for (let r = 0; r < 5; r++) {
        const cols = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < cols; c++) {
            bubbles.push(new Bubble(r, c, getRandomColor()));
        }
    }
}

function drawNextBubblePreview() {
    nextCtx.clearRect(0, 0, 40, 40);
    const b = new Bubble(0, 0, nextBubbleColor, 20, 20);
    b.draw(nextCtx);
}

function spawnCurrentBubble() {
    currentBubble = new Bubble(undefined, undefined, nextBubbleColor, canvas.width / 2, canvas.height - BUBBLE_RADIUS - 10);
    nextBubbleColor = getRandomColor();
    drawNextBubblePreview();
}

// Input Handling
function handleInput(x, y) {
    if (!isGameStarted || isGameOver || !currentBubble || currentBubble.isMoving) return;
    
    // Calculate angle
    const dx = x - currentBubble.x;
    const dy = y - currentBubble.y;
    let angle = Math.atan2(dy, dx);
    
    // Restrict angle to shoot upwards
    if (angle > -0.1) angle = -0.1;
    if (angle < -Math.PI + 0.1) angle = -Math.PI + 0.1;

    currentBubble.vx = Math.cos(angle) * SPEED;
    currentBubble.vy = Math.sin(angle) * SPEED;
    currentBubble.isMoving = true;
}

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    handleInput(e.clientX - rect.left, e.clientY - rect.top);
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    handleInput(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
}, { passive: false });

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    mouseX = e.touches[0].clientX - rect.left;
    mouseY = e.touches[0].clientY - rect.top;
}, { passive: false });


// Game Logic
function getNeighbors(r, c) {
    const neighbors = [];
    const dirs = [
        [0, -1], [0, 1], [-1, 0], [1, 0],
        [-1, (r % 2 === 0 ? -1 : 1)],
        [1, (r % 2 === 0 ? -1 : 1)]
    ];
    
    for (let d of dirs) {
        const nr = r + d[0];
        const nc = c + d[1];
        if (nr >= 0 && nr < MAX_ROWS) {
            const colsInRow = (nr % 2 === 0) ? COLS : COLS - 1;
            if (nc >= 0 && nc < colsInRow) {
                const neighbor = bubbles.find(b => b.r === nr && b.c === nc && !b.isDropping && !b.popping);
                if (neighbor) neighbors.push(neighbor);
            }
        }
    }
    return neighbors;
}

function snapBubble(bubble) {
    bubble.isMoving = false;
    
    // Find closest empty grid slot
    let minD = Infinity;
    let bestR = 0;
    let bestC = 0;
    
    // Search grid space
    for (let r = 0; r < MAX_ROWS; r++) {
        const cols = (r % 2 === 0) ? COLS : COLS - 1;
        for (let c = 0; c < cols; c++) {
            // Is it empty?
            if (!bubbles.some(b => b.r === r && b.c === c && !b.isDropping && !b.popping)) {
                const gx = getGridX(r, c);
                const gy = getGridY(r);
                const d = dist(bubble.x, bubble.y, gx, gy);
                if (d < minD) {
                    minD = d;
                    bestR = r;
                    bestC = c;
                }
            }
        }
    }
    
    bubble.r = bestR;
    bubble.c = bestC;
    bubbles.push(bubble);
    
    handleMatch(bubble);
}

function handleMatch(bubble) {
    // BFS to find matching color
    const matched = [bubble];
    const queue = [bubble];
    const visited = new Set([`${bubble.r},${bubble.c}`]);
    
    while (queue.length > 0) {
        const curr = queue.shift();
        const neighbors = getNeighbors(curr.r, curr.c);
        
        for (let n of neighbors) {
            if (n.color === bubble.color && !visited.has(`${n.r},${n.c}`)) {
                visited.add(`${n.r},${n.c}`);
                matched.push(n);
                queue.push(n);
            }
        }
    }
    
    if (matched.length >= 3) {
        playPopSound();
        // Pop them
        matched.forEach(b => {
            b.popping = true;
            createParticles(b.x, b.y, b.color);
        });
        score += matched.length * 10;
        scoreEl.innerText = score;
        
        setTimeout(() => {
            bubbles = bubbles.filter(b => !b.popping);
            handleDrops();
        }, 200); // Small delay for pop animation
    } else {
        shotsFired++;
        if (shotsFired >= 5) {
            shotsFired = 0;
            rowOffset++;
            // Check loss condition
        }
        checkGameOver();
    }
    
    currentBubble = null;
    if (!isGameOver) {
        spawnCurrentBubble();
    }
}

function handleDrops() {
    // BFS from top row to find connected bubbles
    const connected = new Set();
    const queue = [];
    
    bubbles.forEach(b => {
        if (b.r === 0 && !b.isDropping && !b.popping) {
            queue.push(b);
            connected.add(`${b.r},${b.c}`);
        }
    });
    
    while (queue.length > 0) {
        const curr = queue.shift();
        const neighbors = getNeighbors(curr.r, curr.c);
        for (let n of neighbors) {
            if (!connected.has(`${n.r},${n.c}`)) {
                connected.add(`${n.r},${n.c}`);
                queue.push(n);
            }
        }
    }
    
    // Drop bubbles not in connected set
    let droppedCount = 0;
    bubbles.forEach(b => {
        if (!b.popping && !connected.has(`${b.r},${b.c}`)) {
            b.isDropping = true;
            droppedCount++;
        }
    });
    
    if (droppedCount > 0) {
        score += droppedCount * 20; // Bonus for drops
        scoreEl.innerText = score;
    }
    
    checkGameOver();
}

function checkGameOver() {
    // Win: No bubbles left (that aren't dropping)
    const activeBubbles = bubbles.filter(b => !b.isDropping && !b.popping);
    if (activeBubbles.length === 0) {
        endGame(true);
        return;
    }
    
    // Loss: Any bubble passed the limit
    const lowestY = Math.max(...activeBubbles.map(b => getGridY(b.r)));
    if (lowestY > canvas.height - BUBBLE_RADIUS * 4) {
        endGame(false);
    }
}

function endGame(isWin) {
    isGameOver = true;
    modalTitle.innerText = isWin ? 'You Win!' : 'Game Over';
    finalScoreEl.innerText = score;
    gameOverModal.classList.remove('hidden');
}

function resetGame() {
    score = 0;
    shotsFired = 0;
    scoreEl.innerText = score;
    isGameOver = false;
    gameOverModal.classList.add('hidden');
    nextBubbleColor = getRandomColor();
    initGrid();
    spawnCurrentBubble();
}

restartBtn.addEventListener('click', resetGame);


// Main Loop
function drawLauncher(ctx) {
    if (!currentBubble || currentBubble.isMoving) return;
    
    const startX = canvas.width / 2;
    const startY = canvas.height - BUBBLE_RADIUS - 10;
    
    const dx = mouseX - startX;
    const dy = mouseY - startY;
    let angle = Math.atan2(dy, dx);
    
    if (angle > -0.1) angle = -0.1;
    if (angle < -Math.PI + 0.1) angle = -Math.PI + 0.1;

    // Draw aiming line (dotted)
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([5, 10]);
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + Math.cos(angle) * 150, startY + Math.sin(angle) * 150);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw cannon base
    ctx.beginPath();
    ctx.arc(startX, startY + 10, 30, Math.PI, 0);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fill();
    ctx.restore();
}

function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!isGameOver) {
        drawLauncher(ctx);
        
        // Draw & update grid bubbles
        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];
            b.update();
            b.draw(ctx);
            
            // Remove dropped bubbles that are off screen
            if (b.isDropping && b.y > canvas.height + BUBBLE_RADIUS) {
                bubbles.splice(i, 1);
            }
        }
        
        // Update & draw current active bubble
        if (currentBubble) {
            currentBubble.update();
            currentBubble.draw(ctx);
            
            if (currentBubble.isMoving) {
                // Check ceiling
                if (currentBubble.y - BUBBLE_RADIUS < getGridY(0) - ROW_HEIGHT / 2) {
                    snapBubble(currentBubble);
                } else {
                    // Check collision with other bubbles
                    for (let b of bubbles) {
                        if (!b.isDropping && !b.popping) {
                            if (dist(currentBubble.x, currentBubble.y, b.x, b.y) < BUBBLE_RADIUS * 2 - 2) { // Small offset for leniency
                                snapBubble(currentBubble);
                                break;
                            }
                        }
                    }
                }
            }
        }
        
        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.update();
            p.draw(ctx);
            if (p.life <= 0) particles.splice(i, 1);
        }
    }
    
    requestAnimationFrame(loop);
}

// Start
nextBubbleColor = getRandomColor();
initGrid();
spawnCurrentBubble();
loop();

// ----------------------------------------------------
// Web3 Setup
// ----------------------------------------------------
const BUILDER_CODE = "bc_3xzi5e5s";
let provider;
let signer;
let userAddress;
const BASE_CHAIN_ID = 8453; // Base Mainnet

const connectWalletBtn = document.getElementById('connectWalletBtn');
const startGameBtn = document.getElementById('startGameBtn');
const web3Modal = document.getElementById('web3Modal');
const web3Status = document.getElementById('web3Status');
const dailyCheckInBtn = document.getElementById('dailyCheckInBtn');

let isGameStarted = false;

// Convert string to hex
function stringToHex(str) {
    let hex = '0x';
    for(let i=0; i<str.length; i++) {
        hex += str.charCodeAt(i).toString(16);
    }
    return hex;
}

const encodedBuilderCode = stringToHex(BUILDER_CODE); // e.g. "0x62635f33787a6935653573"

async function connectWallet() {
    if (typeof window.ethereum !== 'undefined') {
        try {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = provider.getSigner();
            userAddress = await signer.getAddress();
            
            // Check network
            const network = await provider.getNetwork();
            if (network.chainId !== BASE_CHAIN_ID) {
                await switchNetwork();
            } else {
                walletConnected();
            }
        } catch (error) {
            console.error("User denied account access or error occurred", error);
            web3Status.innerText = "Connection failed. Please try again.";
        }
    } else {
        web3Status.innerText = "Please install MetaMask or another Web3 wallet!";
    }
}

async function switchNetwork() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: ethers.utils.hexValue(BASE_CHAIN_ID) }],
        });
        walletConnected();
    } catch (switchError) {
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [
                        {
                            chainId: ethers.utils.hexValue(BASE_CHAIN_ID),
                            chainName: 'Base',
                            rpcUrls: ['https://mainnet.base.org'],
                            nativeCurrency: {
                                name: 'Ether',
                                symbol: 'ETH',
                                decimals: 18
                            },
                            blockExplorerUrls: ['https://basescan.org']
                        }
                    ]
                });
                walletConnected();
            } catch (addError) {
                web3Status.innerText = "Failed to add Base network.";
            }
        } else {
            web3Status.innerText = "Please switch to the Base network in your wallet.";
        }
    }
}

function walletConnected() {
    web3Status.innerText = `Connected: ${userAddress.substring(0, 6)}...${userAddress.substring(38)}`;
    connectWalletBtn.classList.add('hidden');
    startGameBtn.classList.remove('hidden');
    checkDailyStatus();
}

function startGame() {
    web3Modal.classList.add('hidden');
    isGameStarted = true;
}

function checkDailyStatus() {
    const lastCheckIn = localStorage.getItem(`checkIn_${userAddress}`);
    if (lastCheckIn) {
        const timeDiff = Date.now() - parseInt(lastCheckIn);
        if (timeDiff < 24 * 60 * 60 * 1000) {
            dailyCheckInBtn.innerText = "Checked In";
            dailyCheckInBtn.disabled = true;
            return;
        }
    }
    dailyCheckInBtn.innerText = "Check-in";
    dailyCheckInBtn.disabled = false;
}

async function handleDailyCheckIn() {
    if (!signer) {
        alert("Please connect your wallet first!");
        return;
    }
    try {
        dailyCheckInBtn.innerText = "Wait...";
        dailyCheckInBtn.disabled = true;
        
        const tx = await signer.sendTransaction({
            to: userAddress,
            value: ethers.utils.parseEther("0"),
            data: encodedBuilderCode
        });
        
        await tx.wait();
        
        localStorage.setItem(`checkIn_${userAddress}`, Date.now().toString());
        dailyCheckInBtn.innerText = "Checked In";
        
    } catch (error) {
        console.error(error);
        dailyCheckInBtn.innerText = "Check-in";
        dailyCheckInBtn.disabled = false;
    }
}

connectWalletBtn.addEventListener('click', connectWallet);
startGameBtn.addEventListener('click', startGame);
dailyCheckInBtn.addEventListener('click', handleDailyCheckIn);

