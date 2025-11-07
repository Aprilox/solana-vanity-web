const { Keypair } = solanaWeb3;

const vanityInput = document.getElementById('vanity');
const startBtn = document.getElementById('startBtn');
const consoleEl = document.getElementById('console');
const results = document.getElementById('results');
const pubkeyEl = document.getElementById('pubkey');
const privkeyEl = document.getElementById('privkey');
const downloadBtn = document.getElementById('downloadJson');
const downloadBackupBtn = document.getElementById('downloadBackup');
const threadSelect = document.getElementById('threadCount');

let workers = [];
let totalAttempts = 0;
let startTime = 0;
let isRunning = false;
let foundKeypair = null;
let lastMessageData = null;
let threadLine = null;

// === CONSOLE LOG ===
function logConsole(text, type = 'normal') {
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = text;
    if (type === 'prefix') line.setAttribute('data-type', 'prefix');
    consoleEl.appendChild(line);
    consoleEl.scrollTop = consoleEl.scrollHeight;
}

// === THREADS FIXE LIGNE 3 ===
function updateThreadsLine() {
    if (!threadLine) return;
    threadLine.textContent = `Threads: ${workers.length}`; // SANS >
    threadLine.style.display = 'block';
}

// === CPU + THREADS MENU ===
const maxThreads = navigator.hardwareConcurrency || 4;
const threadOptions = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64, 128, 256];
threadOptions.filter(t => t <= maxThreads).forEach(count => {
    const opt = document.createElement('option');
    opt.value = count;
    opt.textContent = `${count} thread${count > 1 ? 's' : ''}`;
    threadSelect.appendChild(opt);
});
if (!threadOptions.includes(maxThreads)) {
    const opt = document.createElement('option');
    opt.value = maxThreads;
    opt.textContent = `${maxThreads} threads (max)`;
    threadSelect.appendChild(opt);
}
threadSelect.value = maxThreads;

// === ÉVÉNEMENTS ===
startBtn.addEventListener('click', () => isRunning ? stopGeneration() : startGeneration());
threadSelect.addEventListener('change', () => {
    if (!isRunning) return;
    adjustWorkers(parseInt(threadSelect.value));
    updateThreadsLine();
});

document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const text = document.getElementById(btn.getAttribute('data-target')).textContent;
        navigator.clipboard.writeText(text).then(() => {
            btn.textContent = 'Copié !';
            setTimeout(() => btn.textContent = 'Copier', 2000);
        });
    });
});

downloadBtn.addEventListener('click', () => {
    if (!foundKeypair) return;
    const json = JSON.stringify(Array.from(foundKeypair.secretKey));
    downloadFile(json, `wallet-${foundKeypair.publicKey.toBase58().slice(0,8)}.json`);
});

downloadBackupBtn.addEventListener('click', () => {
    if (!lastMessageData || !foundKeypair) return;
    const backup = {
        address: lastMessageData.pubkey,
        privateKeyBase58: lastMessageData.privkey,
        secretKey: Array.from(foundKeypair.secretKey),
        generatedAt: new Date().toISOString(),
        prefix: vanityInput.value.trim()
    };
    const secretKeyOneLine = backup.secretKey.join(',');
    const backupOneLine = { ...backup, secretKey: `[${secretKeyOneLine}]` };
    downloadFile(JSON.stringify(backupOneLine, null, 2), `vanity-backup-${backup.address.slice(0,8)}.json`);
});

function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// === GÉNÉRATION ===
function startGeneration() {
    const vanity = vanityInput.value.trim();
    if (!vanity) { alert('Entrez un préfixe !'); return; }

    window.isGenerating = true;
    vanityInput.disabled = true;
    vanityInput.style.background = '#333333';

    isRunning = true;
    startBtn.textContent = 'Arrêter';
    startBtn.classList.add('danger');
    startTime = performance.now();
    totalAttempts = 0;
    results.style.display = 'none';

    consoleEl.innerHTML = `
        <div class="console-line">Démarrage de la génération...</div>
        <div class="console-line" data-type="prefix">Préfixe: ${vanity}</div>
        <div class="console-line thread-line" id="threadLine"></div>
    `;
    threadLine = document.getElementById('threadLine');

    adjustWorkers(parseInt(threadSelect.value));
    updateThreadsLine();

    setInterval(updateStats, 500);
}

function adjustWorkers(targetCount) {
    const current = workers.length;
    if (current === targetCount) return;

    if (current < targetCount) {
        for (let i = current; i < targetCount; i++) {
            const worker = new Worker('worker.js');
            worker.postMessage({ vanity: vanityInput.value.trim() });
            workers.push(worker);
            worker.onmessage = handleWorkerMessage;
        }
    } else {
        const toRemove = workers.splice(targetCount, current - targetCount);
        toRemove.forEach(w => w.terminate());
    }
    updateThreadsLine();
}

function handleWorkerMessage(e) {
    if (e.data.found) {
        lastMessageData = e.data;
        foundKeypair = { 
            secretKey: new Uint8Array(e.data.secretKeyArray),
            publicKey: { toBase58: () => e.data.pubkey }
        };
        stopGeneration();
        displayResult(e.data.pubkey, e.data.privkey);
        logConsole(`TROUVÉ ! Adresse: ${e.data.pubkey}`, 'found-line');
    } else if (e.data.attempts) {
        totalAttempts += e.data.attempts;
    }
}

function updateStats() {
    if (!isRunning || !threadLine) return;

    const elapsed = (performance.now() - startTime) / 1000;
    const speed = elapsed > 0 ? Math.round(totalAttempts / elapsed) : 0;
    const eta = speed > 0 ? estimateTime(vanityInput.value.length, speed) : '∞';

    document.querySelectorAll('.attempts-line, .speed-line').forEach(el => el.remove());

    const attempts = document.createElement('div');
    attempts.className = 'console-line attempts-line';
    attempts.textContent = `Tentatives: ${totalAttempts.toLocaleString()}`;
    threadLine.parentNode.insertBefore(attempts, threadLine.nextSibling);

    const speedLine = document.createElement('div');
    speedLine.className = 'console-line speed-line';
    speedLine.textContent = `Vitesse: ${speed.toLocaleString()} clés/s | ETA: ~${eta}`;
    threadLine.parentNode.insertBefore(speedLine, attempts.nextSibling);

    consoleEl.scrollTop = consoleEl.scrollHeight;
}

function estimateTime(len, speed) {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const possibilities = Math.pow(chars.length, len);
    const seconds = possibilities / speed;
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${(seconds/60).toFixed(1)} min`;
    if (seconds < 86400) return `${(seconds/3600).toFixed(1)} h`;
    return `${(seconds/86400).toFixed(1)} jours`;
}

function stopGeneration() {
    isRunning = false;
    workers.forEach(w => w.terminate());
    workers = [];
    window.isGenerating = false;

    vanityInput.disabled = false;
    vanityInput.style.background = '';
    startBtn.textContent = 'Lancer la Recherche';
    startBtn.classList.remove('danger');
    updateThreadsLine();
    logConsole('Arrêt de la génération.', 'normal');
}

function displayResult(pubkey, privkey) {
    pubkeyEl.textContent = pubkey;
    privkeyEl.textContent = privkey;
    results.style.display = 'block';
}