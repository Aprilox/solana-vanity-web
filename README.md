# Solana Vanity Generator

[![License: CC BY-NC-SA 4.0](https://licensebuttons.net/l/by-nc-sa/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

> **Génère une adresse Solana personnalisée en 1 clic**  
> 🚀 **WebGPU** jusqu'à 700K+ clés/s | ⚡ **CPU WASM** multi-thread  
> 🔒 **100% local** – Aucune donnée envoyée  

🌐 **[vanity.aprilox.fr](https://vanity.aprilox.fr)**

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|----------------|-------------|
| 🎯 **Préfixe / Suffixe** | Recherche case-sensitive (majuscules/minuscules) |
| 🚀 **WebGPU** | Accélération GPU (RTX, AMD, Intel) |
| ⚡ **CPU Multi-thread** | Jusqu'à 256 threads via WebAssembly |
| 🔔 **Notifications** | Son + notification navigateur quand trouvé |
| 📜 **Historique** | 20 dernières adresses sauvegardées |
| 💾 **Préférences** | Mode, threads, batch size mémorisés |
| 📲 **PWA** | Installable sur mobile (iOS/Android) |
| 📦 **Export** | wallet.json (Phantom) + backup JSON |

---

## 🚀 Performance

| Mode | Vitesse | GPU/CPU |
|------|---------|---------|
| WebGPU | ~700K clés/s | RTX 4070 Ti |
| WebGPU | ~400K clés/s | RTX 3060 |
| CPU | ~300K clés/s | Ryzen 9 (24 threads) |
| CPU | ~150K clés/s | i7 (8 threads) |

---

## 📖 Utilisation

1. **Choisis** Préfixe ou Suffixe
2. **Entre** ton pattern (ex: `Sol`, `ABC`)
3. **Sélectionne** CPU ou WebGPU
4. **Lance** la recherche
5. **Copie** ou télécharge le résultat

---

## 🛠️ Tech Stack

- **Frontend** : Vanilla JS, CSS moderne
- **CPU Engine** : Rust → WebAssembly (curve25519-dalek)
- **GPU Engine** : WebGPU + WGSL (Ed25519 natif)
- **Crypto** : Ed25519, Base58, ChaCha8Rng

---

## 🔧 Build

```bash
# Compiler le WASM
cd vanity-wasm
wasm-pack build --target web --release --out-dir ../assets

# Servir localement
npx serve .
```

---

## 📁 Structure

```
├── index.html          # Page principale
├── app.js              # Logique application
├── style.css           # Styles
├── worker.js           # Worker CPU (WASM)
├── worker-gpu.js       # Worker WebGPU
├── sw.js               # Service Worker (PWA)
├── gpu-shaders/        # Shaders WGSL
│   ├── main.wgsl
│   ├── field.wgsl
│   ├── curve.wgsl
│   └── base58.wgsl
├── vanity-wasm/        # Code Rust
│   └── src/lib.rs
└── assets/             # WASM compilé + icons
```

---

## 🔒 Sécurité

- ✅ **100% client-side** – Aucun serveur
- ✅ **Aucun tracking** – Pas d'analytics
- ✅ **Open source** – Code vérifiable
- ⚠️ **Sauvegardez vos clés** – Vous êtes responsable

---

## 📜 Licence

**CC BY-NC-SA 4.0** – [Creative Commons](https://creativecommons.org/licenses/by-nc-sa/4.0/)

- ✅ Usage personnel gratuit
- ❌ Revente interdite
- 📝 Crédit obligatoire : `by Aprilox`

---

**Made with 💚 by [Aprilox](https://github.com/Aprilox)**
