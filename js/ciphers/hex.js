window.Decoder.registerCipher('Hex', {
    testRegex: /^[0-9a-fA-F\s,:;|]+$/,
    entropyRange: [1.0, 4.5],
    decode: (input) => {
        // Remove delimiters
        let clean = input.replace(/[\s,:;|]/g, '');
        if (clean.length % 2 !== 0 || clean.length === 0) return null;
        
        // Pre-allocate result string using array
        const len = clean.length >>> 1;
        const chars = new Array(len);
        
        for (let i = 0, j = 0; i < clean.length; i += 2, j++) {
            const byte = (parseInt(clean[i], 16) << 4) | parseInt(clean[i + 1], 16);
            if (isNaN(byte)) return null;
            chars[j] = String.fromCharCode(byte);
        }
        
        return chars.join('');
    }
});
