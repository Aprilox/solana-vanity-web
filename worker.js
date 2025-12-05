/**
 * Vanity Address Worker
 * Optimisé pour performance maximale
 */

import init, { VanityWorker } from './assets/vanity_wasm.js';

let worker = null;
let running = false;
let totalAttempts = 0;
let lastReportTime = 0;

// Taille du batch - plus grand = moins d'overhead, mais moins réactif
// 5000-10000 est un bon compromis
const BATCH_SIZE = 5000;

// Interval de rapport (ms)
const REPORT_INTERVAL = 150;

// Reseed interval (pour meilleure entropie)
const RESEED_INTERVAL = 1_000_000;

self.onmessage = async (event) => {
    const { type, vanity, searchMode } = event.data;
    
    if (type === 'stop') {
        running = false;
        return;
    }
    
    // Démarrage
    try {
        await init();
        
        // Créer le worker avec le mode approprié
        if (searchMode === 'suffix') {
            worker = VanityWorker.new_suffix(vanity);
        } else {
            worker = new VanityWorker(vanity);
        }
        
        running = true;
        totalAttempts = 0;
        lastReportTime = performance.now();
        
        // Signal prêt
        self.postMessage({ type: 'ready' });
        
        // Lance la boucle de recherche
        runSearchLoop();
    } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
    }
};

function runSearchLoop() {
    if (!running || !worker) return;
    
    const result = worker.search_batch(BATCH_SIZE);
    
    if (result.found) {
        // Trouvé !
        self.postMessage({
            type: 'found',
            pubkey: result.pubkey,
            privkey: result.privkey,
            secretKey: result.secretKey,
            attempts: totalAttempts + result.attempts
        });
        running = false;
        return;
    }
    
    // Mise à jour du compteur
    totalAttempts += result.attempts;
    
    // Reseed périodique pour meilleure entropie
    if (totalAttempts % RESEED_INTERVAL < BATCH_SIZE) {
        worker.reseed();
    }
    
    // Rapport périodique
    const now = performance.now();
    if (now - lastReportTime >= REPORT_INTERVAL) {
        self.postMessage({
            type: 'progress',
            attempts: totalAttempts
        });
        totalAttempts = 0; // Reset après rapport
        lastReportTime = now;
    }
    
    // Continue immédiatement (pas de setTimeout!)
    // On utilise queueMicrotask pour éviter de bloquer complètement le thread
    // mais c'est beaucoup plus rapide que setTimeout
    queueMicrotask(runSearchLoop);
}
