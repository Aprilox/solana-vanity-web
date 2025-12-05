/**
 * WebGPU Vanity Address Worker
 * Uses Ed25519 implemented in WGSL for GPU-accelerated key generation
 */

let device = null;
let pipeline = null;
let running = false;
let shaderCode = null;

// Configuration
const WORKGROUP_SIZE = 256;
let NUM_WORKGROUPS = 1024; // Default, can be changed by user
let BATCH_SIZE = WORKGROUP_SIZE * NUM_WORKGROUPS;

let searchMode = 'prefix';

self.onmessage = async (event) => {
    const { type, vanity, batchMultiplier, searchMode: mode } = event.data;
    
    if (type === 'stop') {
        running = false;
        return;
    }
    
    // Set batch size from user selection
    if (batchMultiplier) {
        NUM_WORKGROUPS = batchMultiplier;
        BATCH_SIZE = WORKGROUP_SIZE * NUM_WORKGROUPS;
    }
    
    // Set search mode
    searchMode = mode || 'prefix';
    
    try {
        await initWebGPU();
        
        running = true;
        self.postMessage({ type: 'ready', batchSize: BATCH_SIZE });
        
        await runSearch(vanity);
        
    } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
    }
};

async function initWebGPU() {
    if (!navigator.gpu) {
        throw new Error('WebGPU non supporté');
    }
    
    const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
    });
    
    if (!adapter) {
        throw new Error('Aucun GPU trouvé');
    }
    
    // Get GPU info
    let gpuInfo = { vendor: 'Unknown', device: 'GPU', description: 'WebGPU' };
    try {
        if (adapter.requestAdapterInfo) {
            const info = await adapter.requestAdapterInfo();
            gpuInfo = {
                vendor: info.vendor || 'Unknown',
                device: info.device || 'GPU',
                description: info.description || info.device || 'WebGPU'
            };
        }
    } catch (e) {}
    
    self.postMessage({ type: 'gpu-info', info: gpuInfo });
    
    device = await adapter.requestDevice({
        requiredLimits: {
            maxStorageBufferBindingSize: 128 * 1024 * 1024,
            maxBufferSize: 128 * 1024 * 1024,
        }
    });
    
    // Load shader
    const shaderResponse = await fetch('/gpu-shaders/main.wgsl');
    shaderCode = await shaderResponse.text();
    
    // Create pipeline
    const shaderModule = device.createShaderModule({ code: shaderCode });
    
    pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
            module: shaderModule,
            entryPoint: 'main'
        }
    });
}

async function runSearch(prefix) {
    let totalAttempts = 0;
    let lastReportTime = performance.now();
    const REPORT_INTERVAL = 200;
    
    // Encode prefix as char codes
    const prefixChars = new Uint32Array(16);
    for (let i = 0; i < Math.min(prefix.length, 16); i++) {
        prefixChars[i] = prefix.charCodeAt(i);
    }
    
    // Buffer sizes
    const seedBufferSize = 32 * BATCH_SIZE;
    const resultBufferSize = 48 * BATCH_SIZE;
    const paramsBufferSize = 80;
    
    // === DOUBLE BUFFERING: Create 2 sets of buffers ===
    const buffers = [0, 1].map(() => ({
        seedBuffer: device.createBuffer({
            size: seedBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        }),
        resultBuffer: device.createBuffer({
            size: resultBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        }),
        readBuffer: device.createBuffer({
            size: resultBufferSize,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        }),
        seeds: new Uint32Array(8 * BATCH_SIZE),
        bindGroup: null
    }));
    
    const paramsBuffer = device.createBuffer({
        size: paramsBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    
    // Upload params
    const paramsData = new Uint32Array(20);
    paramsData.set(prefixChars, 0);
    paramsData[16] = prefix.length;
    paramsData[17] = 0; // batch_offset (updated per batch)
    paramsData[18] = searchMode === 'suffix' ? 1 : 0; // is_suffix
    device.queue.writeBuffer(paramsBuffer, 0, paramsData);
    
    // Create bind groups for both buffer sets
    for (const buf of buffers) {
        buf.bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: buf.seedBuffer } },
                { binding: 1, resource: { buffer: buf.resultBuffer } },
                { binding: 2, resource: { buffer: paramsBuffer } }
            ]
        });
    }
    
    // Helper to generate seeds
    const maxBytesPerCall = 65536;
    const u32PerCall = maxBytesPerCall / 4;
    function generateSeeds(seeds) {
        for (let offset = 0; offset < seeds.length; offset += u32PerCall) {
            const chunk = seeds.subarray(offset, Math.min(offset + u32PerCall, seeds.length));
            crypto.getRandomValues(chunk);
        }
    }
    
    // Helper to process results
    function processResults(results, seeds) {
        for (let i = 0; i < BATCH_SIZE; i++) {
            const offset = i * 12;
            const found = results[offset + 8];
            
            if (found === 1) {
                const pubkeyU32 = results.slice(offset, offset + 8);
                const pubkeyBytes = new Uint8Array(32);
                for (let j = 0; j < 8; j++) {
                    pubkeyBytes[j * 4 + 0] = pubkeyU32[j] & 0xFF;
                    pubkeyBytes[j * 4 + 1] = (pubkeyU32[j] >> 8) & 0xFF;
                    pubkeyBytes[j * 4 + 2] = (pubkeyU32[j] >> 16) & 0xFF;
                    pubkeyBytes[j * 4 + 3] = (pubkeyU32[j] >> 24) & 0xFF;
                }
                
                const seedOffset = i * 8;
                const seedU32 = seeds.slice(seedOffset, seedOffset + 8);
                const seedBytes = new Uint8Array(32);
                for (let j = 0; j < 8; j++) {
                    seedBytes[j * 4 + 0] = seedU32[j] & 0xFF;
                    seedBytes[j * 4 + 1] = (seedU32[j] >> 8) & 0xFF;
                    seedBytes[j * 4 + 2] = (seedU32[j] >> 16) & 0xFF;
                    seedBytes[j * 4 + 3] = (seedU32[j] >> 24) & 0xFF;
                }
                
                seedBytes[0] &= 248;
                seedBytes[31] &= 127;
                seedBytes[31] |= 64;
                
                const fullSecret = new Uint8Array(64);
                fullSecret.set(seedBytes, 0);
                fullSecret.set(pubkeyBytes, 32);
                
                const pubkey = toBase58(pubkeyBytes);
                const privkey = toBase58(fullSecret);
                
                const matches = searchMode === 'suffix' 
                    ? pubkey.endsWith(prefix) 
                    : pubkey.startsWith(prefix);
                if (matches) {
                    return { pubkey, privkey, seedBytes };
                }
            }
        }
        return null;
    }
    
    let currentBuffer = 0;
    let batchNumber = 0;
    let pendingRead = null;
    let pendingSeeds = null;
    
    // Start first batch
    generateSeeds(buffers[0].seeds);
    device.queue.writeBuffer(buffers[0].seedBuffer, 0, buffers[0].seeds);
    
    while (running) {
        const buf = buffers[currentBuffer];
        const nextBuffer = 1 - currentBuffer;
        const nextBuf = buffers[nextBuffer];
        
        // Dispatch current batch
        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, buf.bindGroup);
        passEncoder.dispatchWorkgroups(NUM_WORKGROUPS);
        passEncoder.end();
        commandEncoder.copyBufferToBuffer(buf.resultBuffer, 0, buf.readBuffer, 0, resultBufferSize);
        device.queue.submit([commandEncoder.finish()]);
        
        // While GPU works, prepare next batch seeds (CPU work in parallel)
        generateSeeds(nextBuf.seeds);
        device.queue.writeBuffer(nextBuf.seedBuffer, 0, nextBuf.seeds);
        
        // Process previous batch results if any
        if (pendingRead !== null) {
            const match = processResults(pendingRead, pendingSeeds);
            if (match) {
                self.postMessage({
                    type: 'found',
                    pubkey: match.pubkey,
                    privkey: match.privkey,
                    secretKey: match.seedBytes,
                    attempts: totalAttempts
                });
                running = false;
                cleanup();
                return;
            }
        }
        
        // Wait for current batch GPU results
        await buf.readBuffer.mapAsync(GPUMapMode.READ);
        pendingRead = new Uint32Array(buf.readBuffer.getMappedRange().slice());
        pendingSeeds = buf.seeds.slice();
        buf.readBuffer.unmap();
        
        totalAttempts += BATCH_SIZE;
        batchNumber++;
        currentBuffer = nextBuffer;
        
        // Progress report
        const now = performance.now();
        if (now - lastReportTime >= REPORT_INTERVAL) {
            self.postMessage({
                type: 'progress',
                attempts: totalAttempts
            });
            totalAttempts = 0;
            lastReportTime = now;
        }
    }
    
    // Process last batch
    if (pendingRead !== null) {
        const match = processResults(pendingRead, pendingSeeds);
        if (match) {
            self.postMessage({
                type: 'found',
                pubkey: match.pubkey,
                privkey: match.privkey,
                secretKey: match.seedBytes,
                attempts: totalAttempts
            });
        }
    }
    
    cleanup();
    
    function cleanup() {
        for (const buf of buffers) {
            buf.seedBuffer.destroy();
            buf.resultBuffer.destroy();
            buf.readBuffer.destroy();
        }
        paramsBuffer.destroy();
    }
}

// Base58 encoding
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function toBase58(bytes) {
    const digits = [0];
    
    for (const byte of bytes) {
        let carry = byte;
        for (let i = 0; i < digits.length; i++) {
            carry += digits[i] << 8;
            digits[i] = carry % 58;
            carry = (carry / 58) | 0;
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = (carry / 58) | 0;
        }
    }
    
    let result = '';
    for (const byte of bytes) {
        if (byte === 0) result += '1';
        else break;
    }
    
    for (let i = digits.length - 1; i >= 0; i--) {
        result += BASE58_ALPHABET[digits[i]];
    }
    
    return result;
}
