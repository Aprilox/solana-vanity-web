use wasm_bindgen::prelude::*;
use curve25519_dalek::edwards::EdwardsPoint;
use curve25519_dalek::scalar::Scalar;
use rand_chacha::ChaCha8Rng;
use rand_core::{RngCore, SeedableRng};

// Base58 alphabet (Bitcoin/Solana)
const BASE58_ALPHABET: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/// Encode bytes to Base58 string
#[inline]
fn to_base58(input: &[u8]) -> String {
    if input.is_empty() {
        return String::new();
    }

    // Count leading zeros
    let leading_zeros = input.iter().take_while(|&&b| b == 0).count();
    
    // Allocate enough space
    let capacity = (input.len() * 138 / 100) + 1;
    let mut output = Vec::with_capacity(capacity);
    
    // Convert to base58
    let mut bytes = input.to_vec();
    while !bytes.is_empty() {
        let mut remainder = 0u32;
        let mut new_bytes = Vec::with_capacity(bytes.len());
        
        for &byte in &bytes {
            let acc = (remainder << 8) + byte as u32;
            let div = acc / 58;
            remainder = acc % 58;
            
            if !new_bytes.is_empty() || div > 0 {
                new_bytes.push(div as u8);
            }
        }
        
        output.push(BASE58_ALPHABET[remainder as usize]);
        bytes = new_bytes;
    }
    
    // Add leading '1's for each leading zero byte
    for _ in 0..leading_zeros {
        output.push(b'1');
    }
    
    output.reverse();
    String::from_utf8(output).unwrap_or_default()
}

#[wasm_bindgen]
pub struct VanityWorker {
    pattern: String,
    is_suffix: bool,
    rng: ChaCha8Rng,
}

#[wasm_bindgen]
impl VanityWorker {
    #[wasm_bindgen(constructor)]
    pub fn new(pattern: String) -> Self {
        // Seed the fast PRNG once with system randomness
        let mut seed = [0u8; 32];
        getrandom::getrandom(&mut seed).expect("Failed to get random seed");
        let rng = ChaCha8Rng::from_seed(seed);
        
        Self { pattern, is_suffix: false, rng }
    }
    
    /// Create with suffix mode
    #[wasm_bindgen]
    pub fn new_suffix(pattern: String) -> Self {
        let mut seed = [0u8; 32];
        getrandom::getrandom(&mut seed).expect("Failed to get random seed");
        let rng = ChaCha8Rng::from_seed(seed);
        
        Self { pattern, is_suffix: true, rng }
    }

    /// Reseed with additional entropy
    #[wasm_bindgen]
    pub fn reseed(&mut self) {
        let mut seed = [0u8; 32];
        getrandom::getrandom(&mut seed).expect("Failed to get random seed");
        self.rng = ChaCha8Rng::from_seed(seed);
    }

    /// High-performance batch search
    #[wasm_bindgen]
    pub fn search_batch(&mut self, batch_size: u32) -> JsValue {
        let mut seed = [0u8; 32];
        
        for _ in 0..batch_size {
            // Generate random seed using fast PRNG (no syscall!)
            self.rng.fill_bytes(&mut seed);
            
            // Clamp for Ed25519
            seed[0] &= 248;
            seed[31] &= 127;
            seed[31] |= 64;

            // Compute public key
            let secret = Scalar::from_bytes_mod_order(seed);
            let point = EdwardsPoint::mul_base(&secret);
            let public_key = point.compress().to_bytes();

            // Encode to Base58 and check pattern
            let address = to_base58(&public_key);
            
            let matches = if self.is_suffix {
                address.ends_with(&self.pattern)
            } else {
                address.starts_with(&self.pattern)
            };
            
            if matches {
                // Found! Build the full secret key
                let mut full_secret = [0u8; 64];
                full_secret[..32].copy_from_slice(&seed);
                full_secret[32..].copy_from_slice(&public_key);
                
                let privkey = to_base58(&full_secret);
                
                let obj = js_sys::Object::new();
                js_sys::Reflect::set(&obj, &"found".into(), &true.into()).unwrap();
                js_sys::Reflect::set(&obj, &"pubkey".into(), &address.into()).unwrap();
                js_sys::Reflect::set(&obj, &"privkey".into(), &privkey.into()).unwrap();
                
                let secret_array = js_sys::Uint8Array::from(&seed[..]);
                js_sys::Reflect::set(&obj, &"secretKey".into(), &secret_array.into()).unwrap();
                
                return obj.into();
            }
        }

        // Batch complete, not found
        let obj = js_sys::Object::new();
        js_sys::Reflect::set(&obj, &"found".into(), &false.into()).unwrap();
        js_sys::Reflect::set(&obj, &"attempts".into(), &batch_size.into()).unwrap();
        obj.into()
    }
}
