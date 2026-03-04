window.Decoder.registerCipher('XOR', {
    // XOR does not have an entropy range because it can be applied to any data
    // and can produce any entropy depending on the key and input.
    isMulti: true, // Indicates it returns an array of possible decodes

    decode: (input, options = {}) => {
        if (!input || input.length === 0) return null;

        const results = [];
        let keysToTry = [];
        let explicitKeyName = '';

        // Determine which keys to try based on UI options
        if (options.xorKey && options.xorKey.trim().length > 0) {
            const keyType = options.xorKeyType || 'utf8';
            const keyStr = options.xorKey.trim();

            if (keyType === 'hex') {
                const cleanHex = keyStr.replace(/[^0-9a-fA-F]/g, '');
                if (cleanHex.length > 0 && cleanHex.length % 2 === 0) {
                    const keyBytes = [];
                    for (let i = 0; i < cleanHex.length; i += 2) {
                        keyBytes.push(parseInt(cleanHex.slice(i, i + 2), 16));
                    }
                    keysToTry.push(keyBytes);
                    explicitKeyName = `Hex:${cleanHex}`;
                }
            } else { // utf8
                const keyBytes = Array.from(new TextEncoder().encode(keyStr));
                keysToTry.push(keyBytes);
                explicitKeyName = `UTF8:${keyStr}`;
            }
        } else {
            // Implicit brute force: 0-255 (1 byte)
            keysToTry = new Array(256);
            for (let i = 0; i < 256; i++) {
                keysToTry[i] = [i];
            }
        }

        if (keysToTry.length === 0) return null;

        const inputBytes = new Uint8Array(input.length);
        for (let i = 0; i < input.length; i++) {
            inputBytes[i] = input.charCodeAt(i);
        }

        for (const key of keysToTry) {
            const outBytes = new Uint8Array(input.length);
            const keyLen = key.length;

            for (let i = 0; i < inputBytes.length; i++) {
                outBytes[i] = inputBytes[i] ^ key[i % keyLen];
            }

            // Convert back to string in chunks to avoid O(n^2) concatenation
            let outStr = '';
            const chunkSize = 8192;
            for (let i = 0; i < outBytes.length; i += chunkSize) {
                const chunk = outBytes.subarray(i, i + chunkSize);
                outStr += String.fromCharCode.apply(null, chunk);
            }

            let opName = 'XOR';
            if (explicitKeyName) {
                opName = `XOR(Key:${explicitKeyName})`;
            } else {
                const hexKey = key[0].toString(16).padStart(2, '0').toUpperCase();
                opName = `XOR(Key:0x${hexKey})`;
            }

            results.push({ op: opName, value: outStr });
        }

        return results;
    }
});
