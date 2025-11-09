// worker.js — ROUE JUSQU'À PREMIER BATCH
import init, { VanityWorker } from '/assets/vanity_wasm.js';

let worker = null;
let pending = 0;
let last = 0;
const BATCH = 1000;

self.onmessage = async (e) => {
    try {
        await init({ wasm: '/assets/vanity_wasm_bg.wasm' });
        worker = new VanityWorker(e.data.vanity);

        // SIGNAL IMMÉDIAT
        self.postMessage({ ready: true });

        pending = 0;
        last = performance.now();
        loop();
    } catch (err) {
        self.postMessage({ error: err.message });
    }
};

function loop() {
    if (!worker) return;

    const res = worker.search(BATCH);

    if (res.found) {
        self.postMessage({
            found: true,
            pubkey: res.pubkey,
            privkey: res.privkey,
            secretKeyArray: res.secretKey,
            delta: pending + BATCH
        });
        return;
    }

    pending += BATCH;
    const now = performance.now();
    if (now - last > 100 || pending > 500000) {
        self.postMessage({ delta: pending });
        pending = 0;
        last = now;
    }

    setTimeout(loop, 0);
}