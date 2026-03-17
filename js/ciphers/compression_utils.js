/**
 * Compression Utilities - Shared helper functions for compression ciphers
 */

window.DecoderCompressionUtils = (function() {
    
    // Convert string to Uint8Array efficiently
    function stringToBytes(str) {
        const len = str.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = str.charCodeAt(i) & 0xff;
        }
        return bytes;
    }
    
    // Convert Uint8Array to string efficiently
    function bytesToString(bytes) {
        const len = bytes.length;
        const chars = new Array(len);
        for (let i = 0; i < len; i++) {
            chars[i] = String.fromCharCode(bytes[i]);
        }
        return chars.join('');
    }
    
    // Check for gzip magic bytes (1f 8b)
    function isGzipHeader(bytes) {
        return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    }
    
    // Check for zlib header (compression method + flags)
    function isZlibHeader(bytes) {
        // Zlib has at least 2 bytes: CMF and FLG
        if (bytes.length < 2) return false;
        const cmf = bytes[0];
        const flg = bytes[1];
        // Check CMF: compression method must be 8 (deflate)
        if ((cmf & 0x0f) !== 8) return false;
        // Check FLG: header must pass Adler-32 check
        return ((cmf * 256 + flg) % 31) === 0;
    }
    
    // Fast check if data looks compressed (low printable ratio)
    function looksCompressed(bytes) {
        if (bytes.length < 4) return false;
        let nonPrintable = 0;
        const sampleLimit = Math.min(bytes.length, 256);
        for (let i = 0; i < sampleLimit; i++) {
            const b = bytes[i];
            // Control chars, high ASCII, and non-printable ASCII
            if (b < 32 || (b > 126 && b !== 9 && b !== 10 && b !== 13)) {
                nonPrintable++;
            }
        }
        // If >40% non-printable, likely compressed/encoded
        return nonPrintable / sampleLimit > 0.4;
    }
    
    return {
        stringToBytes,
        bytesToString,
        isGzipHeader,
        isZlibHeader,
        looksCompressed
    };
})();