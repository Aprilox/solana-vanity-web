// =============================================================================
// Ed25519 Curve Operations
// Curve: -x^2 + y^2 = 1 + d*x^2*y^2 where d = -121665/121666
// Using extended coordinates (X, Y, Z, T) where x = X/Z, y = Y/Z, xy = T/Z
// =============================================================================

// d = -121665/121666 mod p (little-endian)
const D_L0: u32 = 0x135978A3u;
const D_L1: u32 = 0x75EB4DCAu;
const D_L2: u32 = 0x4141D8ABu;
const D_L3: u32 = 0x00700A4Du;
const D_L4: u32 = 0x7779E898u;
const D_L5: u32 = 0x8CC74079u;
const D_L6: u32 = 0x2B6FFE73u;
const D_L7: u32 = 0x52036CEEu;

// 2*d
const D2_L0: u32 = 0x26B2F159u;
const D2_L1: u32 = 0xEBD69B94u;
const D2_L2: u32 = 0x8283B156u;
const D2_L3: u32 = 0x00E0149Au;
const D2_L4: u32 = 0xEEF3D130u;
const D2_L5: u32 = 0x198E80F2u;
const D2_L6: u32 = 0x56DFFCE7u;
const D2_L7: u32 = 0x2406D9DCu;

// Base point B coordinates (little-endian)
// By = 4/5 mod p
const BY_L0: u32 = 0x66666658u;
const BY_L1: u32 = 0x66666666u;
const BY_L2: u32 = 0x66666666u;
const BY_L3: u32 = 0x66666666u;
const BY_L4: u32 = 0x66666666u;
const BY_L5: u32 = 0x66666666u;
const BY_L6: u32 = 0x66666666u;
const BY_L7: u32 = 0x66666666u;

// Bx (computed from By)
const BX_L0: u32 = 0x6B17D1F2u;
const BX_L1: u32 = 0xE12C4247u;
const BX_L2: u32 = 0xF8BCE6E5u;
const BX_L3: u32 = 0x63A440F2u;
const BX_L4: u32 = 0x77037D81u;
const BX_L5: u32 = 0x2DEB33A0u;
const BX_L6: u32 = 0xF4A13945u;
const BX_L7: u32 = 0x216936D3u;

// Point in extended coordinates
struct GeP3 {
    X: Fe,
    Y: Fe,
    Z: Fe,
    T: Fe,
}

// Point in projective coordinates (for doubling)
struct GeP2 {
    X: Fe,
    Y: Fe,
    Z: Fe,
}

// Precomputed point for addition
struct GePre {
    ypx: Fe,  // Y + X
    ymx: Fe,  // Y - X
    xy2d: Fe, // 2 * d * X * Y
}

// Get d constant
fn fe_d() -> Fe {
    return Fe(D_L0, D_L1, D_L2, D_L3, D_L4, D_L5, D_L6, D_L7);
}

// Get 2*d constant
fn fe_d2() -> Fe {
    return Fe(D2_L0, D2_L1, D2_L2, D2_L3, D2_L4, D2_L5, D2_L6, D2_L7);
}

// Identity point (neutral element)
fn ge_zero() -> GeP3 {
    return GeP3(
        fe_zero(),  // X = 0
        fe_one(),   // Y = 1
        fe_one(),   // Z = 1
        fe_zero()   // T = 0
    );
}

// Base point B in extended coordinates
fn ge_base() -> GeP3 {
    let x = Fe(BX_L0, BX_L1, BX_L2, BX_L3, BX_L4, BX_L5, BX_L6, BX_L7);
    let y = Fe(BY_L0, BY_L1, BY_L2, BY_L3, BY_L4, BY_L5, BY_L6, BY_L7);
    return GeP3(x, y, fe_one(), fe_mul(x, y));
}

// Convert P3 to P2
fn ge_p3_to_p2(p: GeP3) -> GeP2 {
    return GeP2(p.X, p.Y, p.Z);
}

// Double a point: r = 2 * p
// Input: P2, Output: P3
fn ge_p2_dbl(p: GeP2) -> GeP3 {
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#doubling-dbl-2008-hwcd
    let XX = fe_sq(p.X);
    let YY = fe_sq(p.Y);
    let ZZ = fe_sq(p.Z);
    let ZZ2 = fe_add(ZZ, ZZ);
    
    // a = -1 for Ed25519, so aXX = -XX
    let aXX = fe_neg(XX);
    
    let B = fe_add(p.X, p.Y);
    let BB = fe_sq(B);
    let E = fe_sub(BB, fe_add(XX, YY));
    let G = fe_add(aXX, YY);
    let F = fe_sub(G, ZZ2);
    let H = fe_sub(aXX, YY);
    
    let X3 = fe_mul(E, F);
    let Y3 = fe_mul(G, H);
    let T3 = fe_mul(E, H);
    let Z3 = fe_mul(F, G);
    
    return GeP3(X3, Y3, Z3, T3);
}

// Double a P3 point
fn ge_p3_dbl(p: GeP3) -> GeP3 {
    return ge_p2_dbl(ge_p3_to_p2(p));
}

// Add two points: r = p + q
// Using unified addition formula
fn ge_add(p: GeP3, q: GeP3) -> GeP3 {
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
    let d2 = fe_d2();
    
    let A = fe_mul(fe_sub(p.Y, p.X), fe_sub(q.Y, q.X));
    let B = fe_mul(fe_add(p.Y, p.X), fe_add(q.Y, q.X));
    let C = fe_mul(fe_mul(p.T, q.T), d2);
    let D = fe_add(fe_mul(p.Z, q.Z), fe_mul(p.Z, q.Z));
    
    let E = fe_sub(B, A);
    let F = fe_sub(D, C);
    let G = fe_add(D, C);
    let H = fe_add(B, A);
    
    let X3 = fe_mul(E, F);
    let Y3 = fe_mul(G, H);
    let T3 = fe_mul(E, H);
    let Z3 = fe_mul(F, G);
    
    return GeP3(X3, Y3, Z3, T3);
}

// Subtract: r = p - q
fn ge_sub(p: GeP3, q: GeP3) -> GeP3 {
    // Negate q: (-X, Y, Z, -T)
    let neg_q = GeP3(fe_neg(q.X), q.Y, q.Z, fe_neg(q.T));
    return ge_add(p, neg_q);
}

// Scalar multiplication: r = scalar * B (base point)
// Using double-and-add (constant time not required for vanity generation)
fn ge_scalarmult_base(scalar: array<u32, 8>) -> GeP3 {
    var result = ge_zero();
    var base = ge_base();
    
    // Process each bit of the scalar
    for (var i: u32 = 0u; i < 256u; i = i + 1u) {
        let word_idx = i / 32u;
        let bit_idx = i % 32u;
        let bit = (scalar[word_idx] >> bit_idx) & 1u;
        
        if (bit == 1u) {
            result = ge_add(result, base);
        }
        base = ge_p3_dbl(base);
    }
    
    return result;
}

// Alternative scalar multiplication using precomputed table
// More efficient but uses more memory
fn ge_scalarmult_base_opt(scalar: array<u32, 8>) -> GeP3 {
    // For better performance, we use a windowed method
    // But for simplicity, we use the basic double-and-add
    return ge_scalarmult_base(scalar);
}

// Compress point to 32 bytes (Y coordinate with sign of X in MSB)
fn ge_tobytes(p: GeP3) -> array<u32, 8> {
    // Convert from projective to affine: x = X/Z, y = Y/Z
    let zinv = fe_inv(p.Z);
    let x = fe_mul(p.X, zinv);
    let y = fe_mul(p.Y, zinv);
    
    // Reduce y
    let y_reduced = fe_reduce(y);
    
    // Result is y with sign of x in MSB
    var result = fe_to_array(y_reduced);
    
    // Set MSB based on sign of x (x is "negative" if its LSB is 1)
    let x_reduced = fe_reduce(x);
    let x_sign = fe_get(x_reduced, 0u) & 1u;
    
    // Set bit 255 (MSB of limb 7)
    result[7] = result[7] | (x_sign << 31u);
    
    return result;
}

// Load scalar from seed (with clamping for Ed25519)
fn load_scalar_clamped(seed: array<u32, 8>) -> array<u32, 8> {
    var scalar = seed;
    
    // Clamp: clear lowest 3 bits and highest bit, set second-highest bit
    // In little-endian: limb[0] &= 0xFFFFFFF8, limb[7] &= 0x3FFFFFFF, limb[7] |= 0x40000000
    
    // Clear lowest 3 bits of first byte (limb[0] bits 0-2)
    scalar[0] = scalar[0] & 0xFFFFFFF8u;
    
    // Clear bit 255 (MSB of last limb) and set bit 254
    scalar[7] = (scalar[7] & 0x3FFFFFFFu) | 0x40000000u;
    
    return scalar;
}

