// =============================================================================
// Field Element Arithmetic for Ed25519
// Field: GF(p) where p = 2^255 - 19
// Representation: 8 limbs of 32 bits each (256 bits total)
// =============================================================================

// p = 2^255 - 19 in little-endian limbs
// p = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFED
const P0: u32 = 0xFFFFFFEDu;
const P1: u32 = 0xFFFFFFFFu;
const P2: u32 = 0xFFFFFFFFu;
const P3: u32 = 0xFFFFFFFFu;
const P4: u32 = 0xFFFFFFFFu;
const P5: u32 = 0xFFFFFFFFu;
const P6: u32 = 0xFFFFFFFFu;
const P7: u32 = 0x7FFFFFFFu;

// Field element: 256-bit number in 8 x 32-bit limbs (little-endian)
struct Fe {
    l0: u32, l1: u32, l2: u32, l3: u32,
    l4: u32, l5: u32, l6: u32, l7: u32,
}

// Zero element
fn fe_zero() -> Fe {
    return Fe(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
}

// One element
fn fe_one() -> Fe {
    return Fe(1u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
}

// Load from array
fn fe_from_array(a: array<u32, 8>) -> Fe {
    return Fe(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7]);
}

// Store to array
fn fe_to_array(f: Fe) -> array<u32, 8> {
    return array<u32, 8>(f.l0, f.l1, f.l2, f.l3, f.l4, f.l5, f.l6, f.l7);
}

// Get limb by index
fn fe_get(f: Fe, i: u32) -> u32 {
    switch(i) {
        case 0u: { return f.l0; }
        case 1u: { return f.l1; }
        case 2u: { return f.l2; }
        case 3u: { return f.l3; }
        case 4u: { return f.l4; }
        case 5u: { return f.l5; }
        case 6u: { return f.l6; }
        case 7u: { return f.l7; }
        default: { return 0u; }
    }
}

// Set limb by index (returns new Fe)
fn fe_set(f: Fe, i: u32, v: u32) -> Fe {
    var r = f;
    switch(i) {
        case 0u: { r.l0 = v; }
        case 1u: { r.l1 = v; }
        case 2u: { r.l2 = v; }
        case 3u: { r.l3 = v; }
        case 4u: { r.l4 = v; }
        case 5u: { r.l5 = v; }
        case 6u: { r.l6 = v; }
        case 7u: { r.l7 = v; }
        default: {}
    }
    return r;
}

// Get P limb by index
fn p_get(i: u32) -> u32 {
    switch(i) {
        case 0u: { return P0; }
        case 1u: { return P1; }
        case 2u: { return P2; }
        case 3u: { return P3; }
        case 4u: { return P4; }
        case 5u: { return P5; }
        case 6u: { return P6; }
        case 7u: { return P7; }
        default: { return 0u; }
    }
}

// Compare a >= b (returns 1 if true, 0 if false)
fn fe_gte(a: Fe, b: Fe) -> u32 {
    // Compare from most significant limb
    for (var i: i32 = 7; i >= 0; i = i - 1) {
        let ai = fe_get(a, u32(i));
        let bi = fe_get(b, u32(i));
        if (ai > bi) { return 1u; }
        if (ai < bi) { return 0u; }
    }
    return 1u; // Equal
}

// Compare a >= p
fn fe_gte_p(a: Fe) -> u32 {
    for (var i: i32 = 7; i >= 0; i = i - 1) {
        let ai = fe_get(a, u32(i));
        let pi = p_get(u32(i));
        if (ai > pi) { return 1u; }
        if (ai < pi) { return 0u; }
    }
    return 1u;
}

// Addition: r = a + b (no reduction)
fn fe_add_noreduce(a: Fe, b: Fe) -> Fe {
    var r = fe_zero();
    var carry: u32 = 0u;
    
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        let ai = fe_get(a, i);
        let bi = fe_get(b, i);
        let sum: u32 = ai + bi + carry;
        // Detect overflow: if sum < ai (when carry=0) or sum <= ai (when carry=1)
        if (carry == 0u) {
            carry = select(0u, 1u, sum < ai);
        } else {
            carry = select(0u, 1u, sum <= ai);
        }
        r = fe_set(r, i, sum);
    }
    
    return r;
}

// Subtraction: r = a - b (assumes a >= b, or wraps)
fn fe_sub_noreduce(a: Fe, b: Fe) -> Fe {
    var r = fe_zero();
    var borrow: u32 = 0u;
    
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        let ai = fe_get(a, i);
        let bi = fe_get(b, i);
        let diff: u32 = ai - bi - borrow;
        // Detect underflow
        if (borrow == 0u) {
            borrow = select(0u, 1u, ai < bi);
        } else {
            borrow = select(0u, 1u, ai <= bi);
        }
        r = fe_set(r, i, diff);
    }
    
    return r;
}

// Add p to a
fn fe_add_p(a: Fe) -> Fe {
    var r = fe_zero();
    var carry: u32 = 0u;
    
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        let ai = fe_get(a, i);
        let pi = p_get(i);
        let sum: u32 = ai + pi + carry;
        if (carry == 0u) {
            carry = select(0u, 1u, sum < ai);
        } else {
            carry = select(0u, 1u, sum <= ai);
        }
        r = fe_set(r, i, sum);
    }
    
    return r;
}

// Subtract p from a (assumes a >= p)
fn fe_sub_p(a: Fe) -> Fe {
    var r = fe_zero();
    var borrow: u32 = 0u;
    
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        let ai = fe_get(a, i);
        let pi = p_get(i);
        let diff: u32 = ai - pi - borrow;
        if (borrow == 0u) {
            borrow = select(0u, 1u, ai < pi);
        } else {
            borrow = select(0u, 1u, ai <= pi);
        }
        r = fe_set(r, i, diff);
    }
    
    return r;
}

// Reduce: if a >= p, subtract p
fn fe_reduce(a: Fe) -> Fe {
    if (fe_gte_p(a) == 1u) {
        return fe_sub_p(a);
    }
    return a;
}

// Addition with reduction: r = (a + b) mod p
fn fe_add(a: Fe, b: Fe) -> Fe {
    var r = fe_add_noreduce(a, b);
    // May need to subtract p once or twice
    r = fe_reduce(r);
    r = fe_reduce(r);
    return r;
}

// Subtraction with reduction: r = (a - b) mod p
fn fe_sub(a: Fe, b: Fe) -> Fe {
    var r: Fe;
    if (fe_gte(a, b) == 1u) {
        r = fe_sub_noreduce(a, b);
    } else {
        // a < b, so compute (a + p) - b
        let ap = fe_add_p(a);
        r = fe_sub_noreduce(ap, b);
    }
    return fe_reduce(r);
}

// Multiplication: r = (a * b) mod p
// Uses schoolbook multiplication followed by reduction
fn fe_mul(a: Fe, b: Fe) -> Fe {
    // Product is 512 bits (16 limbs)
    var product: array<u32, 16>;
    for (var i: u32 = 0u; i < 16u; i = i + 1u) {
        product[i] = 0u;
    }
    
    // Schoolbook multiplication
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        var carry: u32 = 0u;
        let ai = fe_get(a, i);
        
        for (var j: u32 = 0u; j < 8u; j = j + 1u) {
            let bj = fe_get(b, j);
            let k = i + j;
            
            // Multiply: ai * bj (64-bit result)
            let ai_lo = ai & 0xFFFFu;
            let ai_hi = ai >> 16u;
            let bj_lo = bj & 0xFFFFu;
            let bj_hi = bj >> 16u;
            
            let p0 = ai_lo * bj_lo;
            let p1 = ai_lo * bj_hi;
            let p2 = ai_hi * bj_lo;
            let p3 = ai_hi * bj_hi;
            
            let mid = p1 + p2;
            let mid_carry = select(0u, 0x10000u, mid < p1);
            
            var lo = p0 + (mid << 16u);
            let lo_carry1 = select(0u, 1u, lo < p0);
            lo = lo + carry;
            let lo_carry2 = select(0u, 1u, lo < carry);
            lo = lo + product[k];
            let lo_carry3 = select(0u, 1u, lo < product[k]);
            
            product[k] = lo;
            carry = p3 + (mid >> 16u) + mid_carry + lo_carry1 + lo_carry2 + lo_carry3;
        }
        
        product[i + 8u] = carry;
    }
    
    // Reduction mod p = 2^255 - 19
    // For a 512-bit number: result = low_255_bits + 38 * high_bits
    // Since p = 2^255 - 19, we have 2^255 ≡ 19 (mod p)
    // And 2^256 ≡ 38 (mod p)
    
    var r = fe_zero();
    var carry: u32 = 0u;
    
    // First, handle bits 0-255 (limbs 0-7, but limb 7 only lower 31 bits)
    // And add 38 * bits 256-511
    
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        let lo = product[i];
        let hi = product[i + 8u];
        
        // Multiply hi by 38 (since 2^256 ≡ 38 mod p)
        let hi_lo = hi & 0xFFFFu;
        let hi_hi = hi >> 16u;
        let m0 = hi_lo * 38u;
        let m1 = hi_hi * 38u;
        let hi_38 = m0 + (m1 << 16u);
        let hi_38_carry = m1 >> 16u;
        
        var sum = lo + hi_38 + carry;
        let sum_carry1 = select(0u, 1u, sum < lo);
        let sum_carry2 = select(0u, 1u, (sum - lo) < hi_38);
        
        r = fe_set(r, i, sum);
        carry = hi_38_carry + sum_carry1 + sum_carry2;
    }
    
    // Handle remaining carry
    while (carry > 0u) {
        let c38 = carry * 38u;
        carry = 0u;
        
        var sum = fe_get(r, 0u) + c38;
        let sc = select(0u, 1u, sum < c38);
        r = fe_set(r, 0u, sum);
        
        for (var i: u32 = 1u; i < 8u; i = i + 1u) {
            if (sc == 0u) { break; }
            sum = fe_get(r, i) + 1u;
            let sc2 = select(0u, 1u, sum == 0u);
            r = fe_set(r, i, sum);
            if (sc2 == 0u) { break; }
        }
    }
    
    // Final reduction
    r = fe_reduce(r);
    r = fe_reduce(r);
    
    return r;
}

// Square: r = a^2 mod p (uses fe_mul for simplicity, can be optimized)
fn fe_sq(a: Fe) -> Fe {
    return fe_mul(a, a);
}

// Square n times
fn fe_sq_n(a: Fe, n: u32) -> Fe {
    var r = a;
    for (var i: u32 = 0u; i < n; i = i + 1u) {
        r = fe_sq(r);
    }
    return r;
}

// Inversion: r = a^(-1) mod p = a^(p-2) mod p
// Using addition chain for p-2 = 2^255 - 21
fn fe_inv(a: Fe) -> Fe {
    // Compute a^(p-2) using optimized addition chain
    // p - 2 = 2^255 - 21
    
    let a2 = fe_sq(a);           // a^2
    let a3 = fe_mul(a2, a);      // a^3
    let a4 = fe_sq(a2);          // a^4
    let a5 = fe_mul(a4, a);      // a^5
    let a10 = fe_sq(a5);         // a^10
    let a11 = fe_mul(a10, a);    // a^11
    let a21 = fe_mul(a11, a10);  // a^21
    let a22 = fe_mul(a21, a);    // a^22
    
    // a^(2^5 - 1) = a^31
    var t = fe_sq(a11);          // a^22
    t = fe_mul(t, a);            // a^23
    t = fe_sq(t);                // a^46
    t = fe_mul(t, a);            // a^47
    
    // Build up using repeated squaring
    // a^(2^10 - 1)
    var t10 = fe_sq_n(a11, 5);
    t10 = fe_mul(t10, a11);
    
    // a^(2^20 - 1)
    var t20 = fe_sq_n(t10, 10);
    t20 = fe_mul(t20, t10);
    
    // a^(2^40 - 1)
    var t40 = fe_sq_n(t20, 20);
    t40 = fe_mul(t40, t20);
    
    // a^(2^50 - 1)
    var t50 = fe_sq_n(t40, 10);
    t50 = fe_mul(t50, t10);
    
    // a^(2^100 - 1)
    var t100 = fe_sq_n(t50, 50);
    t100 = fe_mul(t100, t50);
    
    // a^(2^200 - 1)
    var t200 = fe_sq_n(t100, 100);
    t200 = fe_mul(t200, t100);
    
    // a^(2^250 - 1)
    var t250 = fe_sq_n(t200, 50);
    t250 = fe_mul(t250, t50);
    
    // a^(2^255 - 32)
    var r = fe_sq_n(t250, 5);
    
    // a^(2^255 - 21) = a^(p-2)
    r = fe_mul(r, a11);
    
    return r;
}

// Negate: r = -a mod p = p - a
fn fe_neg(a: Fe) -> Fe {
    var p = Fe(P0, P1, P2, P3, P4, P5, P6, P7);
    return fe_sub(p, a);
}

// Check if a is zero
fn fe_is_zero(a: Fe) -> bool {
    let r = fe_reduce(a);
    return (r.l0 | r.l1 | r.l2 | r.l3 | r.l4 | r.l5 | r.l6 | r.l7) == 0u;
}

// Check if a is negative (LSB of reduced form)
fn fe_is_negative(a: Fe) -> bool {
    let r = fe_reduce(a);
    return (r.l0 & 1u) == 1u;
}

// Conditional select: if cond, return b, else return a
fn fe_select(a: Fe, b: Fe, cond: bool) -> Fe {
    if (cond) {
        return b;
    }
    return a;
}

