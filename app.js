/**
 * Solana Vanity Generator - App Controller
 * Supporte CPU (WASM multi-thread) et WebGPU
 */

// === DOM Elements ===
const DOM = {
    vanityInput: document.getElementById('vanity'),
    startBtn: document.getElementById('startBtn'),
    console: document.getElementById('console'),
    results: document.getElementById('results'),
    pubkey: document.getElementById('pubkey'),
    privkey: document.getElementById('privkey'),
    downloadJson: document.getElementById('downloadJson'),
    downloadBackup: document.getElementById('downloadBackup'),
    threadSelect: document.getElementById('threadCount'),
    gpuSelect: document.getElementById('gpuSelect'),
    gpuBatchSelect: document.getElementById('gpuBatchSelect'),
    gpuInfo: document.getElementById('gpuInfo'),
    modeCpu: document.getElementById('modeCpu'),
    modeGpu: document.getElementById('modeGpu'),
    cpuSettings: document.getElementById('cpuSettings'),
    gpuSettings: document.getElementById('gpuSettings')
};

// === State ===
const state = {
    workers: [],
    gpuWorker: null,
    totalAttempts: 0,
    startTime: 0,
    isRunning: false,
    foundKeypair: null,
    lastMessageData: null,
    statsInterval: null,
    mode: 'cpu', // 'cpu' ou 'gpu'
    gpuAvailable: false,
    gpuInfo: null,
    autoScroll: true
};

// === Console Elements (réutilisés) ===
let consoleElements = {
    threadLine: null,
    attemptsLine: null,
    speedLine: null,
    loadingLine: null
};

// === Constants ===
const MAX_THREADS = navigator.hardwareConcurrency || 4;
const THREAD_OPTIONS = [1, 2, 4, 8, 12, 16, 24, 32, 48, 64, 128, 256];
const STATS_UPDATE_INTERVAL = 200;

// === Initialization ===
async function init() {
    setupThreadSelector();
    setupEventListeners();
    await checkWebGPU();
    loadPreferences();
    loadHistory();
}

// === Préférences (localStorage) ===
function savePreferences() {
    const prefs = {
        mode: state.mode,
        threads: DOM.threadSelect?.value,
        gpuBatch: DOM.gpuBatchSelect?.value
    };
    localStorage.setItem('vanity-prefs', JSON.stringify(prefs));
}

function loadPreferences() {
    try {
        const prefs = JSON.parse(localStorage.getItem('vanity-prefs'));
        if (!prefs) return;
        
        // Mode
        if (prefs.mode === 'gpu' && state.gpuAvailable) {
            DOM.modeGpu.checked = true;
            state.mode = 'gpu';
            DOM.cpuSettings.style.display = 'none';
            DOM.gpuSettings.style.display = 'block';
        }
        
        // Threads
        if (prefs.threads && DOM.threadSelect) {
            DOM.threadSelect.value = prefs.threads;
        }
        
        // GPU Batch
        if (prefs.gpuBatch && DOM.gpuBatchSelect) {
            DOM.gpuBatchSelect.value = prefs.gpuBatch;
        }
    } catch (e) {
        // Préférences invalides, ignorer
    }
}

// === Historique ===
function saveToHistory(pubkey, privkey) {
    try {
        let history = JSON.parse(localStorage.getItem('vanity-history') || '[]');
        
        // Ajouter en début
        history.unshift({
            pubkey,
            privkey,
            date: new Date().toISOString()
        });
        
        // Limiter à 20 entrées
        if (history.length > 20) {
            history = history.slice(0, 20);
        }
        
        localStorage.setItem('vanity-history', JSON.stringify(history));
        renderHistory();
    } catch (e) {
        console.error('Erreur sauvegarde historique:', e);
    }
}

function loadHistory() {
    try {
        const history = JSON.parse(localStorage.getItem('vanity-history') || '[]');
        if (history.length > 0) {
            renderHistory();
        }
    } catch (e) {
        // Historique invalide
    }
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem('vanity-history') || '[]');
    const container = document.getElementById('history');
    const list = document.getElementById('historyList');
    
    if (history.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    list.innerHTML = '';
    
    history.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'history-item';
        
        const date = new Date(item.date);
        const dateStr = date.toLocaleDateString('fr-FR', { 
            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
        });
        
        div.innerHTML = `
            <div class="history-info">
                <div class="history-pubkey">${item.pubkey}</div>
                <div class="history-date">${dateStr}</div>
            </div>
            <div class="history-actions">
                <button onclick="copyHistoryKey(${index}, 'pubkey')">Adresse</button>
                <button onclick="copyHistoryKey(${index}, 'privkey')">Clé</button>
            </div>
        `;
        
        list.appendChild(div);
    });
}

function copyHistoryKey(index, type) {
    try {
        const history = JSON.parse(localStorage.getItem('vanity-history') || '[]');
        const item = history[index];
        if (!item) return;
        
        const text = type === 'pubkey' ? item.pubkey : item.privkey;
        const btn = event.target;
        
        copyText(text).then(() => {
            const original = btn.textContent;
            btn.textContent = '✓';
            setTimeout(() => btn.textContent = original, 1000);
        }).catch(() => {
            btn.textContent = '✗';
            setTimeout(() => btn.textContent = type === 'pubkey' ? 'Adresse' : 'Clé', 1000);
        });
    } catch (e) {
        console.error('Erreur copie:', e);
    }
}

function clearHistory() {
    if (confirm('Supprimer tout l\'historique ?')) {
        localStorage.removeItem('vanity-history');
        document.getElementById('history').style.display = 'none';
    }
}

// Exposer pour les onclick HTML
window.copyHistoryKey = copyHistoryKey;

// === Effacer résultats ===
function clearResults() {
    DOM.pubkey.textContent = '';
    DOM.privkey.textContent = '';
    DOM.results.style.display = 'none';
    state.foundKeypair = null;
    state.lastMessageData = null;
}

function setupThreadSelector() {
    const validOptions = THREAD_OPTIONS.filter(t => t <= MAX_THREADS);
    
    validOptions.forEach(count => {
        const opt = document.createElement('option');
        opt.value = count;
        opt.textContent = `${count} thread${count > 1 ? 's' : ''}`;
        DOM.threadSelect.appendChild(opt);
    });
    
    if (!THREAD_OPTIONS.includes(MAX_THREADS)) {
        const opt = document.createElement('option');
        opt.value = MAX_THREADS;
        opt.textContent = `${MAX_THREADS} threads (max)`;
        DOM.threadSelect.appendChild(opt);
    }
    
    DOM.threadSelect.value = MAX_THREADS;
}

// Détecte le nom du GPU via WebGL (plus fiable)
function getGPUNameFromWebGL() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return null;
        
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) return null;
        
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        return cleanGPUName(renderer);
    } catch (e) {
        return null;
    }
}

// Nettoie le nom du GPU pour retirer les infos techniques
function cleanGPUName(rawName) {
    if (!rawName) return null;
    
    // Patterns à supprimer
    let name = rawName
        .replace(/^ANGLE \([^,]+, /, '')  // Remove "ANGLE (NVIDIA, "
        .replace(/\s*\(0x[0-9a-fA-F]+\)/g, '')  // Remove "(0x00002782)"
        .replace(/\s*Direct3D\d+/g, '')  // Remove "Direct3D11"
        .replace(/\s*vs_\d+_\d+/g, '')  // Remove "vs_5_0"
        .replace(/\s*ps_\d+_\d+/g, '')  // Remove "ps_5_0"
        .replace(/\s*,?\s*D3D\d+\)?$/g, '')  // Remove ", D3D11)"
        .replace(/\s*OpenGL Engine/g, '')  // Mac
        .replace(/\s*\(R\)/g, '')  // Remove (R)
        .replace(/\s*\(TM\)/g, '')  // Remove (TM)
        .replace(/\s+/g, ' ')  // Normalize spaces
        .trim();
    
    // Si c'est vide après nettoyage, retourner l'original
    return name || rawName;
}

async function checkWebGPU() {
    console.log('[WebGPU] Vérification...');
    
    if (!navigator.gpu) {
        console.warn('[WebGPU] navigator.gpu non disponible');
        DOM.modeGpu.classList.add('disabled');
        DOM.gpuInfo.textContent = 'WebGPU non supporté (utilise Chrome 113+ ou Edge)';
        DOM.gpuInfo.classList.add('error');
        return;
    }
    
    try {
        console.log('[WebGPU] Demande adaptateur...');
        const adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance'
        });
        
        if (!adapter) {
            console.warn('[WebGPU] Aucun adaptateur trouvé');
            DOM.modeGpu.classList.add('disabled');
            DOM.gpuInfo.textContent = 'Aucun GPU compatible trouvé';
            DOM.gpuInfo.classList.add('error');
            return;
        }
        
        console.log('[WebGPU] Adaptateur trouvé');
        
        // Récupérer les infos GPU - essayer plusieurs méthodes
        let gpuName = null;
        
        // Méthode 1: WebGPU API (nouvelle)
        try {
            if (adapter.requestAdapterInfo) {
                const info = await adapter.requestAdapterInfo();
                gpuName = info.description || info.device || info.vendor;
                state.gpuInfo = info;
                console.log('[WebGPU] Info via API:', info);
            }
        } catch (e) {
            console.log('[WebGPU] requestAdapterInfo non disponible');
        }
        
        // Méthode 2: WebGL fallback (plus fiable pour le nom)
        if (!gpuName || gpuName === 'GPU' || gpuName === 'Unknown') {
            const webglName = getGPUNameFromWebGL();
            if (webglName) {
                gpuName = webglName;
                console.log('[WebGPU] Info via WebGL:', webglName);
            }
        }
        
        // Fallback final
        if (!gpuName) {
            gpuName = 'GPU WebGPU';
        }
        
        state.gpuAvailable = true;
        
        // Mettre à jour le sélecteur GPU
        DOM.gpuSelect.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = 'high-performance';
        opt.textContent = gpuName;
        DOM.gpuSelect.appendChild(opt);
        
        // Essayer de détecter un second GPU (intégré)
        try {
            const lowPowerAdapter = await navigator.gpu.requestAdapter({
                powerPreference: 'low-power'
            });
            if (lowPowerAdapter) {
                let lowPowerName = 'GPU Intégré';
                const lpWebGL = getGPUNameFromWebGL();
                // Si c'est différent du GPU principal, l'ajouter
                if (lpWebGL && lpWebGL !== gpuName) {
                    const opt2 = document.createElement('option');
                    opt2.value = 'low-power';
                    opt2.textContent = lpWebGL + ' (éco)';
                    DOM.gpuSelect.appendChild(opt2);
                }
            }
        } catch (e) {
            // Pas de second GPU, c'est ok
        }
        
        DOM.gpuInfo.textContent = `✓ Prêt`;
        DOM.gpuInfo.classList.add('success');
        
        console.log('[WebGPU] ✓ Prêt:', gpuName);
        
    } catch (err) {
        console.error('[WebGPU] Erreur:', err);
        DOM.modeGpu.classList.add('disabled');
        DOM.gpuInfo.textContent = 'Erreur: ' + err.message;
        DOM.gpuInfo.classList.add('error');
    }
}

function setupEventListeners() {
    DOM.startBtn.addEventListener('click', toggleGeneration);
    
    // Mode selector
    DOM.modeCpu.addEventListener('click', () => setMode('cpu'));
    DOM.modeGpu.addEventListener('click', () => {
        if (state.gpuAvailable) setMode('gpu');
    });
    
    DOM.threadSelect.addEventListener('change', () => {
        savePreferences();
        if (!state.isRunning || state.mode !== 'cpu') return;
        adjustWorkers(parseInt(DOM.threadSelect.value));
    });
    
    if (DOM.gpuBatchSelect) {
        DOM.gpuBatchSelect.addEventListener('change', savePreferences);
    }
    
    // Boutons copier
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => copyToClipboard(btn));
    });
    
    // Téléchargements
    DOM.downloadJson.addEventListener('click', downloadWalletJson);
    DOM.downloadBackup.addEventListener('click', downloadBackup);
    
    // Historique
    document.getElementById('clearHistory')?.addEventListener('click', clearHistory);
    
    // Effacer résultats
    document.getElementById('clearResults')?.addEventListener('click', clearResults);
}

function setMode(mode) {
    if (state.isRunning) return; // Pas de changement pendant la génération
    
    state.mode = mode;
    
    DOM.modeCpu.classList.toggle('active', mode === 'cpu');
    DOM.modeGpu.classList.toggle('active', mode === 'gpu');
    
    DOM.cpuSettings.style.display = mode === 'cpu' ? 'block' : 'none';
    DOM.gpuSettings.style.display = mode === 'gpu' ? 'block' : 'none';
    
    savePreferences();
}

// === Copy Functions ===
function copyText(text) {
    // Essayer l'API moderne d'abord
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    // Fallback pour mobile/anciens navigateurs
    return fallbackCopy(text);
}

function fallbackCopy(text) {
    return new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        
        try {
            document.execCommand('copy');
            resolve();
        } catch (e) {
            reject(e);
        } finally {
            document.body.removeChild(textarea);
        }
    });
}

function copyToClipboard(btn) {
    const targetId = btn.getAttribute('data-target');
    const text = document.getElementById(targetId).textContent;
    
    copyText(text).then(() => {
        const originalText = btn.textContent;
        btn.textContent = 'Copié !';
        setTimeout(() => btn.textContent = originalText, 2000);
    }).catch(() => {
        btn.textContent = 'Erreur';
        setTimeout(() => btn.textContent = 'Copier', 2000);
    });
}

// === Download Functions ===
function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function downloadWalletJson() {
    if (!state.foundKeypair) return;
    
    const json = JSON.stringify(Array.from(state.foundKeypair.secretKey));
    const filename = `wallet-${state.foundKeypair.publicKey.slice(0, 8)}.json`;
    downloadFile(json, filename);
}

function downloadBackup() {
    if (!state.lastMessageData || !state.foundKeypair) return;
    
    const backup = {
        address: state.lastMessageData.pubkey,
        privateKeyBase58: state.lastMessageData.privkey,
        secretKey: Array.from(state.foundKeypair.secretKey),
        generatedAt: new Date().toISOString(),
        prefix: DOM.vanityInput.value.trim()
    };
    
    const filename = `vanity-backup-${backup.address.slice(0, 8)}.json`;
    downloadFile(JSON.stringify(backup, null, 2), filename);
}

// === Generation Control ===
function toggleGeneration() {
    if (state.isRunning) {
        stopGeneration();
    } else {
        startGeneration();
    }
}

function startGeneration() {
    const vanity = DOM.vanityInput.value.trim();
    
    if (!vanity) {
        alert('Entrez un préfixe !');
        return;
    }
    
    // Demander permission notifications au premier lancement
    requestNotificationPermission();
    
    // Valider le préfixe (Base58 uniquement)
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    if (!base58Regex.test(vanity)) {
        alert('Préfixe invalide ! Utilisez uniquement des caractères Base58 (pas de 0, O, I, l)');
        return;
    }
    
    // UI State
    window.isGenerating = true;
    DOM.vanityInput.disabled = true;
    DOM.vanityInput.style.background = '#333333';
    DOM.startBtn.textContent = 'Arrêter';
    DOM.startBtn.classList.add('danger');
    DOM.results.style.display = 'none';
    
    // Désactiver le changement de mode
    DOM.modeCpu.style.pointerEvents = 'none';
    DOM.modeGpu.style.pointerEvents = 'none';
    
    // App State
    state.isRunning = true;
    state.startTime = performance.now();
    state.totalAttempts = 0;
    
    // Setup console
    initConsole(vanity);
    
    const searchMode = document.getElementById('searchMode')?.value || 'prefix';
    
    // Démarrer selon le mode
    if (state.mode === 'gpu') {
        startGPUGeneration(vanity, searchMode);
    } else {
        const threadCount = parseInt(DOM.threadSelect.value);
        adjustWorkers(threadCount);
    }
    
    // Start stats updates
    state.statsInterval = setInterval(updateStats, STATS_UPDATE_INTERVAL);
}

function stopGeneration() {
    // Stop stats
    if (state.statsInterval) {
        clearInterval(state.statsInterval);
        state.statsInterval = null;
    }
    
    // Terminate CPU workers
    state.workers.forEach(w => {
        w.postMessage({ type: 'stop' });
        w.terminate();
    });
    state.workers = [];
    
    // Terminate GPU worker
    if (state.gpuWorker) {
        state.gpuWorker.postMessage({ type: 'stop' });
        state.gpuWorker.terminate();
        state.gpuWorker = null;
    }
    
    // UI State
    window.isGenerating = false;
    DOM.vanityInput.disabled = false;
    DOM.vanityInput.style.background = '';
    DOM.startBtn.textContent = 'Lancer la Recherche';
    DOM.startBtn.classList.remove('danger');
    
    // Réactiver le changement de mode
    DOM.modeCpu.style.pointerEvents = '';
    DOM.modeGpu.style.pointerEvents = '';
    
    // App State
    state.isRunning = false;
    
    // Remove loading if present
    if (consoleElements.loadingLine) {
        consoleElements.loadingLine.remove();
        consoleElements.loadingLine = null;
    }
    
    logConsole('Génération arrêtée.');
}

// === CPU Worker Management ===
function adjustWorkers(targetCount) {
    const current = state.workers.length;
    if (current === targetCount) return;
    
    if (current < targetCount) {
        const vanity = DOM.vanityInput.value.trim();
        for (let i = current; i < targetCount; i++) {
            createCPUWorker(vanity);
        }
    } else {
        const toRemove = state.workers.splice(targetCount);
        toRemove.forEach(w => {
            w.postMessage({ type: 'stop' });
            w.terminate();
        });
    }
    
    updateThreadLine();
}

function createCPUWorker(vanity) {
    const worker = new Worker('worker.js', { type: 'module' });
    
    worker.onmessage = handleCPUWorkerMessage;
    worker.onerror = (err) => {
        logConsole(`Erreur worker: ${err.message}`, 'error');
    };
    
    const searchMode = document.getElementById('searchMode')?.value || 'prefix';
    worker.postMessage({ vanity, searchMode });
    state.workers.push(worker);
}

function handleCPUWorkerMessage(event) {
    const data = event.data;
    
    switch (data.type) {
        case 'ready':
            break;
            
        case 'progress':
            state.totalAttempts += data.attempts;
            if (consoleElements.loadingLine) {
                consoleElements.loadingLine.remove();
                consoleElements.loadingLine = null;
            }
            break;
            
        case 'found':
            handleFound(data);
            break;
            
        case 'error':
            logConsole(`ERREUR: ${data.message}`, 'error');
            stopGeneration();
            break;
    }
}

// === GPU Worker Management ===
function startGPUGeneration(vanity, searchMode) {
    state.gpuWorker = new Worker('worker-gpu.js', { type: 'module' });
    
    state.gpuWorker.onmessage = handleGPUWorkerMessage;
    state.gpuWorker.onerror = (err) => {
        logConsole(`Erreur GPU: ${err.message}`, 'error');
        stopGeneration();
    };
    
    const batchMultiplier = parseInt(DOM.gpuBatchSelect?.value || '1024');
    state.gpuWorker.postMessage({ vanity, batchMultiplier, searchMode });
    updateThreadLine();
}

function handleGPUWorkerMessage(event) {
    const data = event.data;
    
    switch (data.type) {
        case 'ready':
            if (consoleElements.loadingLine) {
                consoleElements.loadingLine.remove();
                consoleElements.loadingLine = null;
            }
            if (data.batchSize) {
                logConsole(`Batch: ${(data.batchSize / 1000).toFixed(0)}K clés/dispatch`);
            }
            break;
            
        case 'gpu-info':
            logConsole(`GPU: ${data.info.description || data.info.device || 'Détecté'}`);
            break;
            
        case 'progress':
            state.totalAttempts += data.attempts;
            break;
            
        case 'found':
            handleFound(data);
            break;
            
        case 'error':
            logConsole(`ERREUR GPU: ${data.message}`, 'error');
            stopGeneration();
            break;
    }
}

// === Sound & Notifications ===
let audioContext = null;

function playSuccessSound() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Jouer 3 bips ascendants
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        notes.forEach((freq, i) => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, audioContext.currentTime + i * 0.15);
            gain.gain.exponentialDecayTo && gain.gain.exponentialDecayTo(0.01, audioContext.currentTime + i * 0.15 + 0.3);
            gain.gain.setValueAtTime(0.3, audioContext.currentTime + i * 0.15);
            gain.gain.linearRampToValueAtTime(0.01, audioContext.currentTime + i * 0.15 + 0.2);
            osc.start(audioContext.currentTime + i * 0.15);
            osc.stop(audioContext.currentTime + i * 0.15 + 0.2);
        });
    } catch (e) {
        console.log('Audio non disponible');
    }
}

function sendNotification(pubkey) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🎉 Adresse Vanity Trouvée !', {
            body: pubkey,
            icon: '/assets/favicon-96x96.png',
            tag: 'vanity-found'
        });
    }
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// === Common Handlers ===
function handleFound(data) {
    state.totalAttempts += data.attempts || 0;
    
    state.lastMessageData = data;
    state.foundKeypair = {
        secretKey: new Uint8Array(data.secretKey),
        publicKey: data.pubkey
    };
    
    // Son + Notification + Historique
    playSuccessSound();
    sendNotification(data.pubkey);
    saveToHistory(data.pubkey, data.privkey);
    
    displayResult(data.pubkey, data.privkey);
    logConsole(`✓ TROUVÉ ! ${data.pubkey}`, 'success');
    
    stopGeneration();
}

// === Console Management ===
function initConsole(vanity) {
    DOM.console.innerHTML = '';
    
    logConsole('Démarrage de la génération...');
    
    const prefixLine = document.createElement('div');
    prefixLine.className = 'console-line';
    prefixLine.setAttribute('data-type', 'prefix');
    prefixLine.textContent = `Préfixe: ${vanity}`;
    DOM.console.appendChild(prefixLine);
    
    consoleElements.threadLine = document.createElement('div');
    consoleElements.threadLine.className = 'console-line thread-line';
    DOM.console.appendChild(consoleElements.threadLine);
    
    consoleElements.attemptsLine = document.createElement('div');
    consoleElements.attemptsLine.className = 'console-line attempts-line';
    consoleElements.attemptsLine.style.display = 'none';
    DOM.console.appendChild(consoleElements.attemptsLine);
    
    consoleElements.speedLine = document.createElement('div');
    consoleElements.speedLine.className = 'console-line speed-line';
    consoleElements.speedLine.style.display = 'none';
    DOM.console.appendChild(consoleElements.speedLine);
    
    consoleElements.loadingLine = document.createElement('div');
    consoleElements.loadingLine.className = 'console-line loading-line';
    consoleElements.loadingLine.innerHTML = state.mode === 'gpu' 
        ? '<span class="spinner"></span> Initialisation WebGPU...'
        : '<span class="spinner"></span> Chargement du moteur WASM...';
    DOM.console.appendChild(consoleElements.loadingLine);
}

function logConsole(text, type = 'normal') {
    const line = document.createElement('div');
    line.className = `console-line ${type === 'success' ? 'found-line' : ''}`;
    line.textContent = text;
    DOM.console.appendChild(line);
    scrollToBottom();
}

function updateThreadLine() {
    if (consoleElements.threadLine) {
        if (state.mode === 'gpu') {
            consoleElements.threadLine.textContent = `Mode: WebGPU 🚀`;
        } else {
            consoleElements.threadLine.textContent = `Threads: ${state.workers.length}`;
        }
    }
}

function updateStats() {
    if (!state.isRunning) return;
    if (state.totalAttempts === 0) return;
    
    const elapsed = (performance.now() - state.startTime) / 1000;
    const speed = elapsed > 0 ? Math.round(state.totalAttempts / elapsed) : 0;
    const eta = speed > 0 ? estimateTime(DOM.vanityInput.value.length, speed) : '∞';
    
    if (consoleElements.attemptsLine) {
        consoleElements.attemptsLine.textContent = `Tentatives: ${state.totalAttempts.toLocaleString()}`;
        consoleElements.attemptsLine.style.display = 'block';
    }
    
    if (consoleElements.speedLine) {
        consoleElements.speedLine.textContent = `Vitesse: ${formatSpeed(speed)} | ETA: ~${eta}`;
        consoleElements.speedLine.style.display = 'block';
    }
    
    scrollToBottom();
}

function formatSpeed(speed) {
    if (speed >= 1_000_000) {
        return `${(speed / 1_000_000).toFixed(2)}M clés/s`;
    } else if (speed >= 1_000) {
        return `${(speed / 1_000).toFixed(1)}K clés/s`;
    }
    return `${speed.toLocaleString()} clés/s`;
}

function estimateTime(prefixLength, speed) {
    const possibilities = Math.pow(58, prefixLength);
    const seconds = possibilities / speed;
    
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    if (seconds < 31536000) return `${(seconds / 86400).toFixed(1)} jours`;
    return `${(seconds / 31536000).toFixed(1)} ans`;
}

// === Display Result ===
function displayResult(pubkey, privkey) {
    DOM.pubkey.textContent = pubkey;
    DOM.privkey.textContent = privkey;
    DOM.results.style.display = 'block';
}

// === Auto-scroll System ===
let autoScrollCheckbox = null;

function initAutoScroll() {
    // Wrapper la console
    const wrapper = document.createElement('div');
    wrapper.className = 'console-wrapper';
    DOM.console.parentNode.insertBefore(wrapper, DOM.console);
    wrapper.appendChild(DOM.console);
    
    // Créer la barre de contrôles
    const controls = document.createElement('div');
    controls.className = 'console-controls';
    
    const label = document.createElement('label');
    autoScrollCheckbox = document.createElement('input');
    autoScrollCheckbox.type = 'checkbox';
    autoScrollCheckbox.id = 'autoScrollCheck';
    autoScrollCheckbox.checked = true;
    autoScrollCheckbox.onchange = () => {
        state.autoScroll = autoScrollCheckbox.checked;
        if (state.autoScroll) {
            DOM.console.scrollTop = DOM.console.scrollHeight;
        }
    };
    
    const labelText = document.createElement('span');
    labelText.textContent = 'Auto-scroll';
    
    label.appendChild(autoScrollCheckbox);
    label.appendChild(labelText);
    controls.appendChild(label);
    wrapper.appendChild(controls);
}

function scrollToBottom() {
    if (state.autoScroll) {
        DOM.console.scrollTop = DOM.console.scrollHeight;
    }
}

// === Initialize ===
initAutoScroll();
init();
registerServiceWorker();

// === PWA Service Worker ===
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then((reg) => {
                    console.log('[PWA] Service Worker enregistré');
                    
                    // Vérifier les mises à jour
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                console.log('[PWA] Nouvelle version disponible');
                            }
                        });
                    });
                })
                .catch((err) => console.log('[PWA] Erreur:', err));
        });
    }
}
