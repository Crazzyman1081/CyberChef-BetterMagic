/**
 * Gunzip Cipher - Decompresses gzip-compressed data
 * Uses the zlib.js library (Zlib.Gunzip)
 */

window.Decoder.registerCipher('Gunzip', {
    // Gzip magic bytes: 0x1f 0x8b
    testRegex: /[\x00-\xff]{2,}/,
    entropyRange: [0, 8.0],
    
    decode: (input) => {
        // Quick pre-check: input must be binary/hex-looking
        if (!input || typeof input !== 'string') return null;
        
        // Convert string to bytes (handle both raw and hex-encoded)
        let bytes;
        try {
            // Clean input - remove whitespace and common separators
            const clean = input.replace(/[\s,;|:]/g, '');
            
            // Check if it's hex-encoded
            if (/^[0-9a-fA-F]+$/.test(clean) && clean.length % 2 === 0) {
                // Hex decode first
                bytes = new Uint8Array(clean.length / 2);
                for (let i = 0; i < bytes.length; i++) {
                    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
                }
            } else {
                // Direct binary string
                bytes = window.DecoderCompressionUtils.stringToBytes(clean);
            }
            
            if (bytes.length < 10) return null; // Too short for gzip header
        } catch (e) {
            return null;
        }
        
        // Quick magic byte check (first two bytes: 0x1f 0x8b)
        if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
            return null;
        }
        
        try {
            // Check if zlib library is loaded
            if (typeof window.Zlib === 'undefined' || typeof window.Zlib.Gunzip === 'undefined') {
                console.warn('[Gunzip] Zlib library not loaded');
                return null;
            }
            
            // Decompress using zlib.js Gunzip
            const gunzip = new window.Zlib.Gunzip(bytes);
            const decompressed = gunzip.decompress();
            
            if (!decompressed || decompressed.length === 0) {
                return null;
            }
            
            // Convert back to string
            return window.DecoderCompressionUtils.bytesToString(decompressed);
        } catch (e) {
            // Decompression failed
            return null;
        }
    }
});