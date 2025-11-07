importScripts('https://unpkg.com/@solana/web3.js@1.95.3/lib/index.iife.min.js');

const { Keypair } = solanaWeb3;

const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes) {
  if (bytes.length === 0) return '';
  const digits = [0];
  for (let i = 0; i < bytes.length; ++i) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; ++j) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let string = '';
  for (let k = digits.length - 1; k >= 0; k--) string += alphabet[digits[k]];
  let leadingZeros = 0;
  for (let l = 0; l < bytes.length; l++) { if (bytes[l] === 0) leadingZeros++; else break; }
  return alphabet[0].repeat(leadingZeros) + string;
}

let vanity = '';
let attempts = 0;
const batchSize = 5000;

function runBatch() {
  for (let i = 0; i < batchSize; i++) {
    const keypair = Keypair.generate();
    const pubkey = keypair.publicKey.toBase58();
    attempts++;

    if (pubkey.startsWith(vanity)) {
      self.postMessage({
        found: true,
        pubkey,
        privkey: base58Encode(keypair.secretKey),
        secretKeyArray: Array.from(keypair.secretKey)
      });
      return;
    }
  }

  self.postMessage({ attempts });
  setTimeout(runBatch, 0);
}

self.onmessage = (e) => {
  vanity = e.data.vanity;
  attempts = 0;
  runBatch();
};