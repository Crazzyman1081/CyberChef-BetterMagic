/**
 * Zlib Inflate Cipher - Decompresses zlib-compressed data (with zlib header)
 * Uses the zlib.js library (Zlib.Inflate)
 */

window.Decoder.registerCipher('Zlib Inflate', {
    testRegex: /[\x00-\xff]{4,}/,
    entropyRange: [0, 8.0],
    decode: (input) => {
        if (!input || typeof input !== 'string') return null;
        
        let bytes;
        try {
            const clean = input.replace(/[\s,;|:]/g, '');
            
            // Hex decode if applicable
            if (/^[0-9a-fA-F]+$/.test(clean) && clean.length % 2 === 0) {
                bytes = new Uint8Array(clean.length / 2);
                for (let i = 0; i < bytes.length; i++) {
                    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
                }
            } else {
                bytes = window.DecoderCompressionUtils.stringToBytes(input);
            }
            
            if (bytes.length < 2) return null;
        } catch (e) {
            return null;
        }
        
        // Validate zlib header (CMF + FLG)
        // CMF byte: compression method must be 8 (deflate)
        const cmf = bytes[0];
        if ((cmf & 0x0f) !== 8) return null; // Not deflate
        
        const flg = bytes[1];
        // Header must pass Adler-32 check: (CMF*256 + FLG) % 31 == 0
        if (((cmf * 256 + flg) % 31) !== 0) return null;
        
        try {
            const decompressed = window.DecoderCompressionUtils.inflateZlib(bytes);
            
            if (!decompressed || decompressed.length === 0) {
                return null;
            }
            
            return window.DecoderCompressionUtils.bytesToString(decompressed);
        } catch (e) {
            return null;
        }
    }
});
