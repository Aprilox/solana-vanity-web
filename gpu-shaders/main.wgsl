// =============================================================================
// Main Compute Shader for Solana Vanity Address Generation
// Combines field arithmetic, curve operations, and Base58 checking
// =============================================================================

// Include all modules (in actual use, these will be concatenated)
// #include "field.wgsl"
// #include "curve.wgsl"
// #include "base58.wgsl"

// ----- FIELD.WGSL INLINE -----
const P0: u32 = 0xFFFFFFEDu;
const P1: u32 = 0xFFFFFFFFu;
const P2: u32 = 0xFFFFFFFFu;
const P3: u32 = 0xFFFFFFFFu;
const P4: u32 = 0xFFFFFFFFu;
const P5: u32 = 0xFFFFFFFFu;
const P6: u32 = 0xFFFFFFFFu;
const P7: u32 = 0x7FFFFFFFu;

struct Fe {
    l0: u32, l1: u32, l2: u32, l3: u32,
    l4: u32, l5: u32, l6: u32, l7: u32,
}

fn fe_zero() -> Fe { return Fe(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u); }
fn fe_one() -> Fe { return Fe(1u, 0u, 0u, 0u, 0u, 0u, 0u, 0u); }

fn fe_get(f: Fe, i: u32) -> u32 {
    switch(i) {
        case 0u: { return f.l0; } case 1u: { return f.l1; }
        case 2u: { return f.l2; } case 3u: { return f.l3; }
        case 4u: { return f.l4; } case 5u: { return f.l5; }
        case 6u: { return f.l6; } case 7u: { return f.l7; }
        default: { return 0u; }
    }
}

fn fe_set(f: Fe, i: u32, v: u32) -> Fe {
    var r = f;
    switch(i) {
        case 0u: { r.l0 = v; } case 1u: { r.l1 = v; }
        case 2u: { r.l2 = v; } case 3u: { r.l3 = v; }
        case 4u: { r.l4 = v; } case 5u: { r.l5 = v; }
        case 6u: { r.l6 = v; } case 7u: { r.l7 = v; }
        default: {}
    }
    return r;
}

fn p_get(i: u32) -> u32 {
    switch(i) {
        case 0u: { return P0; } case 1u: { return P1; }
        case 2u: { return P2; } case 3u: { return P3; }
        case 4u: { return P4; } case 5u: { return P5; }
        case 6u: { return P6; } case 7u: { return P7; }
        default: { return 0u; }
    }
}

fn fe_gte_p(a: Fe) -> u32 {
    for (var i: i32 = 7; i >= 0; i = i - 1) {
        let ai = fe_get(a, u32(i));
        let pi = p_get(u32(i));
        if (ai > pi) { return 1u; }
        if (ai < pi) { return 0u; }
    }
    return 1u;
}

fn fe_sub_p(a: Fe) -> Fe {
    var r = fe_zero();
    var borrow: u32 = 0u;
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        let ai = fe_get(a, i);
        let pi = p_get(i);
        let need_borrow = select((ai < pi), (ai <= pi), (borrow > 0u));
        let diff = ai - pi - borrow;
        borrow = select(0u, 1u, need_borrow);
        r = fe_set(r, i, diff);
    }
    return r;
}

fn fe_reduce(a: Fe) -> Fe {
    if (fe_gte_p(a) == 1u) { return fe_sub_p(a); }
    return a;
}

fn fe_add(a: Fe, b: Fe) -> Fe {
    var r = fe_zero();
    var carry: u32 = 0u;
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        let ai = fe_get(a, i);
        let sum = ai + fe_get(b, i) + carry;
        let overflow = (sum < ai) || ((carry > 0u) && (sum == ai));
        carry = select(0u, 1u, overflow);
        r = fe_set(r, i, sum);
    }
    r = fe_reduce(r);
    r = fe_reduce(r);
    return r;
}

fn fe_sub(a: Fe, b: Fe) -> Fe {
    var r = fe_zero();
    var borrow: u32 = 0u;
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        let ai = fe_get(a, i);
        let bi = fe_get(b, i);
        let need_borrow = select((ai < bi), (ai <= bi), (borrow > 0u));
        r = fe_set(r, i, ai - bi - borrow);
        borrow = select(0u, 1u, need_borrow);
    }
    if (borrow > 0u) {
        // Add p
        var carry: u32 = 0u;
        for (var i: u32 = 0u; i < 8u; i = i + 1u) {
            let ri = fe_get(r, i);
            let sum = ri + p_get(i) + carry;
            carry = select(0u, 1u, (sum < ri));
            r = fe_set(r, i, sum);
        }
    }
    return fe_reduce(r);
}

fn fe_mul(a: Fe, b: Fe) -> Fe {
    var product: array<u32, 16>;
    for (var i: u32 = 0u; i < 16u; i = i + 1u) { product[i] = 0u; }
    
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        var carry: u32 = 0u;
        let ai = fe_get(a, i);
        for (var j: u32 = 0u; j < 8u; j = j + 1u) {
            let bj = fe_get(b, j);
            let k = i + j;
            let ai_lo = ai & 0xFFFFu; let ai_hi = ai >> 16u;
            let bj_lo = bj & 0xFFFFu; let bj_hi = bj >> 16u;
            let p0 = ai_lo * bj_lo;
            let p1 = ai_lo * bj_hi;
            let p2 = ai_hi * bj_lo;
            let p3 = ai_hi * bj_hi;
            let mid = p1 + p2;
            let mid_carry = select(0u, 0x10000u, (mid < p1));
            var lo = p0 + (mid << 16u);
            let lo_c1 = select(0u, 1u, (lo < p0));
            lo = lo + carry;
            let lo_c2 = select(0u, 1u, (lo < carry));
            let pk = product[k];
            lo = lo + pk;
            let lo_c3 = select(0u, 1u, (lo < pk));
            product[k] = lo;
            carry = p3 + (mid >> 16u) + mid_carry + lo_c1 + lo_c2 + lo_c3;
        }
        product[i + 8u] = carry;
    }
    
    var r = fe_zero();
    var carry: u32 = 0u;
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        let lo = product[i];
        let hi = product[i + 8u];
        let hi_lo = (hi & 0xFFFFu) * 38u;
        let hi_hi = ((hi >> 16u) * 38u) << 16u;
        let hi_38 = hi_lo + hi_hi;
        var sum = lo + hi_38 + carry;
        let overflow_carry = select(0u, 1u, (sum < lo));
        let hi_extra = ((hi >> 16u) * 38u) / 0x10000u;
        carry = overflow_carry + hi_extra;
        r = fe_set(r, i, sum);
    }
    while (carry > 0u) {
        let c38 = carry * 38u;
        carry = 0u;
        var sum = fe_get(r, 0u) + c38;
        if (sum < c38) { carry = 1u; }
        r = fe_set(r, 0u, sum);
    }
    return fe_reduce(fe_reduce(r));
}

fn fe_sq(a: Fe) -> Fe { return fe_mul(a, a); }

fn fe_sq_n(a: Fe, n: u32) -> Fe {
    var r = a;
    for (var i: u32 = 0u; i < n; i = i + 1u) { r = fe_sq(r); }
    return r;
}

fn fe_inv(a: Fe) -> Fe {
    let a2 = fe_sq(a);
    let a4 = fe_sq(a2);
    let a8 = fe_sq(a4);
    let a9 = fe_mul(a8, a);
    let a11 = fe_mul(a9, a2);
    var t = fe_sq_n(a11, 5);
    t = fe_mul(t, a11);
    var t2 = fe_sq_n(t, 10);
    t2 = fe_mul(t2, t);
    var t3 = fe_sq_n(t2, 20);
    t3 = fe_mul(t3, t2);
    var t4 = fe_sq_n(t3, 10);
    t4 = fe_mul(t4, t);
    var t5 = fe_sq_n(t4, 50);
    t5 = fe_mul(t5, t4);
    var t6 = fe_sq_n(t5, 100);
    t6 = fe_mul(t6, t5);
    var t7 = fe_sq_n(t6, 50);
    t7 = fe_mul(t7, t4);
    t7 = fe_sq_n(t7, 5);
    return fe_mul(t7, a11);
}

fn fe_neg(a: Fe) -> Fe {
    var p = Fe(P0, P1, P2, P3, P4, P5, P6, P7);
    return fe_sub(p, a);
}

// ----- CURVE.WGSL INLINE -----
const D2_L0: u32 = 0x26B2F159u; const D2_L1: u32 = 0xEBD69B94u;
const D2_L2: u32 = 0x8283B156u; const D2_L3: u32 = 0x00E0149Au;
const D2_L4: u32 = 0xEEF3D130u; const D2_L5: u32 = 0x198E80F2u;
const D2_L6: u32 = 0x56DFFCE7u; const D2_L7: u32 = 0x2406D9DCu;

const BX_L0: u32 = 0x6B17D1F2u; const BX_L1: u32 = 0xE12C4247u;
const BX_L2: u32 = 0xF8BCE6E5u; const BX_L3: u32 = 0x63A440F2u;
const BX_L4: u32 = 0x77037D81u; const BX_L5: u32 = 0x2DEB33A0u;
const BX_L6: u32 = 0xF4A13945u; const BX_L7: u32 = 0x216936D3u;

const BY_L0: u32 = 0x66666658u; const BY_L1: u32 = 0x66666666u;
const BY_L2: u32 = 0x66666666u; const BY_L3: u32 = 0x66666666u;
const BY_L4: u32 = 0x66666666u; const BY_L5: u32 = 0x66666666u;
const BY_L6: u32 = 0x66666666u; const BY_L7: u32 = 0x66666666u;

struct GeP3 { X: Fe, Y: Fe, Z: Fe, T: Fe, }

fn fe_d2() -> Fe { return Fe(D2_L0, D2_L1, D2_L2, D2_L3, D2_L4, D2_L5, D2_L6, D2_L7); }
fn ge_zero() -> GeP3 { return GeP3(fe_zero(), fe_one(), fe_one(), fe_zero()); }
fn ge_base() -> GeP3 {
    let x = Fe(BX_L0, BX_L1, BX_L2, BX_L3, BX_L4, BX_L5, BX_L6, BX_L7);
    let y = Fe(BY_L0, BY_L1, BY_L2, BY_L3, BY_L4, BY_L5, BY_L6, BY_L7);
    return GeP3(x, y, fe_one(), fe_mul(x, y));
}

fn ge_p3_dbl(p: GeP3) -> GeP3 {
    let XX = fe_sq(p.X); let YY = fe_sq(p.Y);
    let ZZ2 = fe_add(fe_sq(p.Z), fe_sq(p.Z));
    let aXX = fe_neg(XX);
    let B = fe_sq(fe_add(p.X, p.Y));
    let E = fe_sub(B, fe_add(XX, YY));
    let G = fe_add(aXX, YY);
    let F = fe_sub(G, ZZ2);
    let H = fe_sub(aXX, YY);
    return GeP3(fe_mul(E, F), fe_mul(G, H), fe_mul(F, G), fe_mul(E, H));
}

fn ge_add(p: GeP3, q: GeP3) -> GeP3 {
    let d2 = fe_d2();
    let A = fe_mul(fe_sub(p.Y, p.X), fe_sub(q.Y, q.X));
    let B = fe_mul(fe_add(p.Y, p.X), fe_add(q.Y, q.X));
    let C = fe_mul(fe_mul(p.T, q.T), d2);
    let D = fe_add(fe_mul(p.Z, q.Z), fe_mul(p.Z, q.Z));
    let E = fe_sub(B, A); let F = fe_sub(D, C);
    let G = fe_add(D, C); let H = fe_add(B, A);
    return GeP3(fe_mul(E, F), fe_mul(G, H), fe_mul(F, G), fe_mul(E, H));
}

fn ge_scalarmult_base(scalar: array<u32, 8>) -> GeP3 {
    var result = ge_zero();
    var base = ge_base();
    for (var i: u32 = 0u; i < 256u; i = i + 1u) {
        let bit = (scalar[i / 32u] >> (i % 32u)) & 1u;
        if (bit == 1u) { result = ge_add(result, base); }
        base = ge_p3_dbl(base);
    }
    return result;
}

fn ge_tobytes(p: GeP3) -> array<u32, 8> {
    let zinv = fe_inv(p.Z);
    let x = fe_mul(p.X, zinv);
    let y = fe_reduce(fe_mul(p.Y, zinv));
    var result = array<u32, 8>(y.l0, y.l1, y.l2, y.l3, y.l4, y.l5, y.l6, y.l7);
    let x_sign = fe_get(fe_reduce(x), 0u) & 1u;
    result[7] = result[7] | (x_sign << 31u);
    return result;
}

// ----- BASE58.WGSL INLINE -----
const B58_CHARS: array<u32, 58> = array<u32, 58>(
    49u,50u,51u,52u,53u,54u,55u,56u,57u,65u,66u,67u,68u,69u,70u,71u,72u,
    74u,75u,76u,77u,78u,80u,81u,82u,83u,84u,85u,86u,87u,88u,89u,90u,
    97u,98u,99u,100u,101u,102u,103u,104u,105u,106u,107u,109u,110u,
    111u,112u,113u,114u,115u,116u,117u,118u,119u,120u,121u,122u
);

fn char_to_b58(c: u32) -> u32 {
    if (c >= 49u && c <= 57u) { return c - 49u; }
    if (c >= 65u && c <= 72u) { return c - 65u + 9u; }
    if (c >= 74u && c <= 78u) { return c - 74u + 17u; }
    if (c >= 80u && c <= 90u) { return c - 80u + 22u; }
    if (c >= 97u && c <= 107u) { return c - 97u + 33u; }
    if (c >= 109u && c <= 110u) { return c - 109u + 44u; }
    if (c >= 111u && c <= 122u) { return c - 111u + 46u; }
    return 255u;
}

fn get_prefix_char(i: u32, p0: vec4<u32>, p1: vec4<u32>, p2: vec4<u32>, p3: vec4<u32>) -> u32 {
    let idx = i % 4u;
    let vec_idx = i / 4u;
    var v: vec4<u32>;
    switch(vec_idx) {
        case 0u: { v = p0; }
        case 1u: { v = p1; }
        case 2u: { v = p2; }
        case 3u: { v = p3; }
        default: { v = vec4<u32>(0u); }
    }
    switch(idx) {
        case 0u: { return v.x; }
        case 1u: { return v.y; }
        case 2u: { return v.z; }
        case 3u: { return v.w; }
        default: { return 0u; }
    }
}

fn check_prefix_impl(pubkey: array<u32, 8>, prefix_len: u32, is_suffix: u32, p0: vec4<u32>, p1: vec4<u32>, p2: vec4<u32>, p3: vec4<u32>) -> u32 {
    if (prefix_len == 0u) { return 1u; }
    
    var bytes: array<u32, 32>;
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        let w = pubkey[i];
        bytes[i*4u] = w & 0xFFu;
        bytes[i*4u+1u] = (w >> 8u) & 0xFFu;
        bytes[i*4u+2u] = (w >> 16u) & 0xFFu;
        bytes[i*4u+3u] = (w >> 24u) & 0xFFu;
    }
    
    var num: array<u32, 32>;
    for (var i: u32 = 0u; i < 32u; i = i + 1u) { num[i] = bytes[i]; }
    
    var digits: array<u32, 64>;
    var dc: u32 = 0u;
    var nl: u32 = 32u;
    
    while (nl > 0u && (dc < 64u)) {
        var rem: u32 = 0u;
        var newl: u32 = 0u;
        var started = false;
        for (var i: u32 = 0u; i < nl; i = i + 1u) {
            let acc = rem * 256u + num[i];
            let q = acc / 58u;
            rem = acc % 58u;
            if (q > 0u || started) {
                num[newl] = q;
                newl = newl + 1u;
                started = true;
            }
        }
        digits[dc] = rem;
        dc = dc + 1u;
        nl = newl;
    }
    
    // Check prefix or suffix
    if (is_suffix == 1u) {
        // Suffix: compare from the end (digits[0] is last char)
        for (var i: u32 = 0u; i < prefix_len; i = i + 1u) {
            let expected = char_to_b58(get_prefix_char(prefix_len - 1u - i, p0, p1, p2, p3));
            let actual = digits[i];
            if (actual != expected) { return 0u; }
        }
    } else {
        // Prefix: compare from the start
        for (var i: u32 = 0u; i < prefix_len; i = i + 1u) {
            let expected = char_to_b58(get_prefix_char(i, p0, p1, p2, p3));
            let actual = digits[dc - 1u - i];
            if (actual != expected) { return 0u; }
        }
    }
    return 1u;
}

// ----- MAIN SHADER -----

struct Seed { 
    d0: vec4<u32>,
    d1: vec4<u32>,
}

struct Result { 
    pubkey0: vec4<u32>,
    pubkey1: vec4<u32>,
    found: u32,
    idx: u32,
    pad0: u32,
    pad1: u32,
}

struct Params { 
    prefix0: vec4<u32>,
    prefix1: vec4<u32>,
    prefix2: vec4<u32>,
    prefix3: vec4<u32>,
    prefix_len: u32,
    batch_offset: u32,
    is_suffix: u32,
    pad1: u32,
}

@group(0) @binding(0) var<storage, read> seeds: array<Seed>;
@group(0) @binding(1) var<storage, read_write> results: array<Result>;
@group(0) @binding(2) var<uniform> params: Params;

fn seed_to_array(s: Seed) -> array<u32, 8> {
    return array<u32, 8>(s.d0.x, s.d0.y, s.d0.z, s.d0.w, s.d1.x, s.d1.y, s.d1.z, s.d1.w);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    let seed = seeds[idx];
    
    // Convert seed to array
    var scalar = seed_to_array(seed);
    
    // Clamp scalar
    scalar[0] = scalar[0] & 0xFFFFFFF8u;
    scalar[7] = (scalar[7] & 0x3FFFFFFFu) | 0x40000000u;
    
    // Compute public key
    let point = ge_scalarmult_base(scalar);
    let pubkey = ge_tobytes(point);
    
    // Check prefix or suffix
    let matches = check_prefix_impl(pubkey, params.prefix_len, params.is_suffix, params.prefix0, params.prefix1, params.prefix2, params.prefix3);
    
    // Store result
    results[idx].pubkey0 = vec4<u32>(pubkey[0], pubkey[1], pubkey[2], pubkey[3]);
    results[idx].pubkey1 = vec4<u32>(pubkey[4], pubkey[5], pubkey[6], pubkey[7]);
    results[idx].found = matches;
    results[idx].idx = idx + params.batch_offset;
}

