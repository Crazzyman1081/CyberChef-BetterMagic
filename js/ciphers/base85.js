/**
 * Base85 Cipher - From CyberChef implementation
 * Decodes Ascii85 / Base85 encoded data.
 */

/**
 * Base85 Cipher - From CyberChef implementation (FromBase85)
 * Decodes Ascii85 / Base85 encoded data.
 */

window.Decoder.registerCipher('Base85', {
    testRegex: /^[!-uz~<>\s]+$/,
    entropyRange: [1.0, 6.5],
    
    decode: (input) => {
        if (!input || typeof input !== 'string') return null;
        
        try {
            // Standard Base85 alphabet: ASCII 33 (!) to 117 (u) inclusive (85 characters)
            // CyberChef expands this range to individual chars: "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuv"
            // Simpler: build the alphabet string from char codes 33 to 117
            let alphabet = '';
            for (let i = 33; i <= 117; i++) {
                alphabet += String.fromCharCode(i);
            }
            // Ensure it's exactly 85 chars
            if (alphabet.length !== 85) return null;
            
            let clean = input.trim();
            
            // Remove delimiters <~ ... ~> if present
            if (clean.startsWith('<~')) clean = clean.slice(2);
            if (clean.endsWith('~>')) clean = clean.slice(0, -2);
            
            // Remove all whitespace
            clean = clean.replace(/\s/g, '');
            
            if (clean.length === 0) return null;
            
            const result = [];
            let i = 0;
            const allZeroGroupChar = 'z'; // Special shorthand for four zero bytes
            
            while (i < clean.length) {
                const char = clean[i];
                
                // Handle all-zero group: 'z' decodes to four zero bytes
                if (char === allZeroGroupChar) {
                    result.push(0, 0, 0, 0);
                    i++;
                    continue;
                }
                
                // Take up to 5 characters forming a base-85 number
                const digits = [];
                let count = 0;
                while (count < 5 && i + count < clean.length) {
                    const ch = clean[i + count];
                    const idx = alphabet.indexOf(ch);
                    if (idx === -1) {
                        // Character not in alphabet: invalid
                        return null;
                    }
                    digits.push(idx);
                    count++;
                }
                i += count;
                
                // If we didn't get 5 digits, pad with the highest digit (84)
                while (digits.length < 5) {
                    digits.push(84);
                }
                
                // Compute the 32-bit integer from these 5 base-85 digits
                let block = 0;
                for (let d = 0; d < 5; d++) {
                    block = block * 85 + digits[d];
                }
                
                // Output (count - 1) bytes, big-endian order
                // For a full 5-digit group we output 4 bytes
                // For partial groups we output 1,2,3 bytes accordingly (count - 1)
                const numBytes = count - 1;
                if (numBytes <= 0) continue; // 1-digit groups produce no bytes (invalid)
                
                // Extract bytes from most significant to least
                if (numBytes >= 1) result.push((block >>> 24) & 0xFF);
                if (numBytes >= 2) result.push((block >>> 16) & 0xFF);
                if (numBytes >= 3) result.push((block >>> 8) & 0xFF);
                if (numBytes >= 4) result.push(block & 0xFF);
            }
            
            return result.length > 0 ? result.map(b => String.fromCharCode(b)).join('') : null;
        } catch (e) {
            return null;
        }
    }
});
