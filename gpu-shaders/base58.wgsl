// =============================================================================
// Base58 Prefix Checking for Solana Vanity Address Generation
// We don't encode the full address - just compute enough to check the prefix
// =============================================================================

// Base58 alphabet (character codes)
const B58_CHARS: array<u32, 58> = array<u32, 58>(
    49u, 50u, 51u, 52u, 53u, 54u, 55u, 56u, 57u,           // '1'-'9' (0-8)
    65u, 66u, 67u, 68u, 69u, 70u, 71u, 72u,                 // 'A'-'H' (9-16)
    74u, 75u, 76u, 77u, 78u,                                 // 'J'-'N' (17-21, skip I)
    80u, 81u, 82u, 83u, 84u, 85u, 86u, 87u, 88u, 89u, 90u,  // 'P'-'Z' (22-32, skip O)
    97u, 98u, 99u, 100u, 101u, 102u, 103u, 104u, 105u, 106u, 107u,  // 'a'-'k' (33-43)
    109u, 110u,                                              // 'm'-'n' (44-45, skip l)
    111u, 112u, 113u, 114u, 115u, 116u, 117u, 118u, 119u, 120u, 121u, 122u  // 'o'-'z' (46-57)
);

// Reverse lookup: char code -> Base58 digit (or 255 if invalid)
fn char_to_b58_digit(c: u32) -> u32 {
    // '1'-'9' -> 0-8
    if (c >= 49u && c <= 57u) { return c - 49u; }
    // 'A'-'H' -> 9-16
    if (c >= 65u && c <= 72u) { return c - 65u + 9u; }
    // 'J'-'N' -> 17-21
    if (c >= 74u && c <= 78u) { return c - 74u + 17u; }
    // 'P'-'Z' -> 22-32
    if (c >= 80u && c <= 90u) { return c - 80u + 22u; }
    // 'a'-'k' -> 33-43
    if (c >= 97u && c <= 107u) { return c - 97u + 33u; }
    // 'm'-'n' -> 44-45
    if (c >= 109u && c <= 110u) { return c - 109u + 44u; }
    // 'o'-'z' -> 46-57
    if (c >= 111u && c <= 122u) { return c - 111u + 46u; }
    return 255u; // Invalid
}

// Convert prefix string (as u32 char codes) to Base58 digits
fn prefix_to_digits(prefix: array<u32, 16>, prefix_len: u32) -> array<u32, 16> {
    var digits: array<u32, 16>;
    for (var i: u32 = 0u; i < 16u; i = i + 1u) {
        if (i < prefix_len) {
            digits[i] = char_to_b58_digit(prefix[i]);
        } else {
            digits[i] = 255u;
        }
    }
    return digits;
}

// Compute Base58 encoding of a 32-byte public key
// Returns the first max_digits characters as Base58 digit indices
fn encode_base58_prefix(pubkey: array<u32, 8>, max_digits: u32) -> array<u32, 16> {
    var result: array<u32, 16>;
    for (var i: u32 = 0u; i < 16u; i = i + 1u) {
        result[i] = 0u;
    }
    
    // Convert pubkey to byte array (little-endian u32 to big-endian bytes for Base58)
    var bytes: array<u32, 32>;
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        let w = pubkey[i];
        // Little-endian u32 to bytes
        bytes[i * 4u + 0u] = w & 0xFFu;
        bytes[i * 4u + 1u] = (w >> 8u) & 0xFFu;
        bytes[i * 4u + 2u] = (w >> 16u) & 0xFFu;
        bytes[i * 4u + 3u] = (w >> 24u) & 0xFFu;
    }
    
    // Count leading zeros (they become '1's in Base58)
    var leading_zeros: u32 = 0u;
    for (var i: u32 = 0u; i < 32u; i = i + 1u) {
        if (bytes[i] != 0u) { break; }
        leading_zeros = leading_zeros + 1u;
    }
    
    // Base58 encode using division
    // We use an array to hold the intermediate big number
    var num: array<u32, 32>;
    for (var i: u32 = 0u; i < 32u; i = i + 1u) {
        num[i] = bytes[i];
    }
    
    var digit_count: u32 = 0u;
    var digits_reversed: array<u32, 64>;
    
    // Keep dividing by 58 and collecting remainders
    var num_len: u32 = 32u;
    while (num_len > 0u && digit_count < 64u) {
        var remainder: u32 = 0u;
        var new_len: u32 = 0u;
        var started = false;
        
        for (var i: u32 = 0u; i < num_len; i = i + 1u) {
            let acc = remainder * 256u + num[i];
            let q = acc / 58u;
            remainder = acc % 58u;
            
            if (q > 0u || started) {
                num[new_len] = q;
                new_len = new_len + 1u;
                started = true;
            }
        }
        
        digits_reversed[digit_count] = remainder;
        digit_count = digit_count + 1u;
        num_len = new_len;
    }
    
    // Add leading '1's (digit 0)
    for (var i: u32 = 0u; i < leading_zeros; i = i + 1u) {
        if (digit_count < 64u) {
            digits_reversed[digit_count] = 0u;
            digit_count = digit_count + 1u;
        }
    }
    
    // Reverse to get final result, take only max_digits
    for (var i: u32 = 0u; i < min(max_digits, 16u); i = i + 1u) {
        if (i < digit_count) {
            result[i] = digits_reversed[digit_count - 1u - i];
        }
    }
    
    return result;
}

// Check if pubkey's Base58 encoding starts with the given prefix
// prefix: array of char codes (e.g., 65 for 'A')
// prefix_len: length of prefix (1-10)
// Returns: 1 if match, 0 if no match
fn check_base58_prefix(pubkey: array<u32, 8>, prefix: array<u32, 16>, prefix_len: u32) -> u32 {
    if (prefix_len == 0u) {
        return 1u; // Empty prefix always matches
    }
    
    // Get expected digits from prefix
    let expected = prefix_to_digits(prefix, prefix_len);
    
    // Compute actual Base58 digits
    let actual = encode_base58_prefix(pubkey, prefix_len);
    
    // Compare
    for (var i: u32 = 0u; i < prefix_len; i = i + 1u) {
        if (actual[i] != expected[i]) {
            return 0u; // No match
        }
    }
    
    return 1u; // Match!
}

// Optimized version: quick reject based on first byte
// The first character of a Solana address is often predictable from the first bytes
fn check_prefix_fast(pubkey: array<u32, 8>, prefix: array<u32, 16>, prefix_len: u32) -> u32 {
    // For now, use the full check
    // TODO: Add fast path based on first byte distribution
    return check_base58_prefix(pubkey, prefix, prefix_len);
}

