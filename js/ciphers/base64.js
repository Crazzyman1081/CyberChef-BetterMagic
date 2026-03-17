window.Decoder.registerCipher('Base64', {
    testRegex: /^[A-Za-z0-9+/=\s]+$/,
    entropyRange: [1.0, 6.1],
    decode: (input) => {
        const clean = input.replace(/[^A-Za-z0-9+/=]/g, '');
        if (!clean) return null;
        try {
            const binary = atob(clean);
            // Fast path: if all chars are ASCII, skip TextDecoder overhead
            let isAscii = true;
            for (let i = 0; i < binary.length && i < 100; i++) {
                if (binary.charCodeAt(i) > 127) {
                    isAscii = false;
                    break;
                }
            }
            if (isAscii) return binary;
            
            // UTF-8 path
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new TextDecoder().decode(bytes);
        } catch (e) { 
            return null;
        }
    }
});
