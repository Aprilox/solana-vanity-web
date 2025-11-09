use wasm_bindgen::prelude::*;
use getrandom::getrandom;
use base58::ToBase58;
use curve25519_dalek::edwards::EdwardsPoint;
use curve25519_dalek::scalar::Scalar;

#[wasm_bindgen]
pub struct VanityWorker {
    prefix: String,
}

#[wasm_bindgen]
impl VanityWorker {
    #[wasm_bindgen(constructor)]
    pub fn new(prefix: String) -> Self {
        Self { prefix }
    }

    #[wasm_bindgen]
    pub fn search(&self, max_attempts: u32) -> JsValue {
        let mut seed = [0u8; 32];
        let mut found = false;
        let mut pubkey = String::new();
        let mut privkey = String::new();
        let mut secret_key = Vec::new();

        for _ in 0..max_attempts {
            getrandom(&mut seed).unwrap();
            seed[0] &= 248;
            seed[31] &= 127;
            seed[31] |= 64;

            let secret = Scalar::from_bytes_mod_order(seed);
            let point = EdwardsPoint::mul_base(&secret);
            let public_key = point.compress().to_bytes();
            let address = public_key.to_base58();

            if address.starts_with(&self.prefix) {
                let mut full_secret = [0u8; 64];
                full_secret[0..32].copy_from_slice(&seed);        // CORRIGÉ
                full_secret[32..64].copy_from_slice(&public_key); // CORRIGÉ

                found = true;
                pubkey = address;
                privkey = full_secret.to_base58();
                secret_key = seed.to_vec();
                break;
            }
        }

        let obj = js_sys::Object::new();

        if found {
            js_sys::Reflect::set(&obj, &"found".into(), &true.into()).unwrap();
            js_sys::Reflect::set(&obj, &"pubkey".into(), &pubkey.into()).unwrap();
            js_sys::Reflect::set(&obj, &"privkey".into(), &privkey.into()).unwrap();
            
            let secret_array = js_sys::Uint8Array::from(&secret_key[..]);
            js_sys::Reflect::set(&obj, &"secretKey".into(), &secret_array.into()).unwrap();
        } else {
            js_sys::Reflect::set(&obj, &"found".into(), &false.into()).unwrap();
            js_sys::Reflect::set(&obj, &"delta".into(), &max_attempts.into()).unwrap();
        }

        obj.into()
    }
}