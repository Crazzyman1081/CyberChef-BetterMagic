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
            // Implicit brute force: 0-255 (1 byte) - optimized to avoid array allocation
            keysToTry = 256; // Signal for optimized path
        }

        if (keysToTry.length === 0 && keysToTry !== 256) return null;

        const inputBytes = new Uint8Array(input.length);
        for (let i = 0; i < input.length; i++) {
            inputBytes[i] = input.charCodeAt(i);
        }

        // Optimized brute force path with WASM acceleration
        if (keysToTry === 256) {
            const outBytes = new Uint8Array(input.length);
            const chunkSize = 8192;
            const useWasm = window.DecoderWasm && window.DecoderWasm.isReady();
            
            for (let key = 0; key < 256; key++) {
                // Use WASM if available, otherwise optimized JS
                if (useWasm) {
                    window.DecoderWasm.xorBytes(inputBytes, key, outBytes);
                } else {
                    // Optimized JS fallback with loop unrolling
                    let i = 0;
                    const limit = inputBytes.length - (inputBytes.length % 8);
                    for (; i < limit; i += 8) {
                        outBytes[i] = inputBytes[i] ^ key;
                        outBytes[i + 1] = inputBytes[i + 1] ^ key;
                        outBytes[i + 2] = inputBytes[i + 2] ^ key;
                        outBytes[i + 3] = inputBytes[i + 3] ^ key;
                        outBytes[i + 4] = inputBytes[i + 4] ^ key;
                        outBytes[i + 5] = inputBytes[i + 5] ^ key;
                        outBytes[i + 6] = inputBytes[i + 6] ^ key;
                        outBytes[i + 7] = inputBytes[i + 7] ^ key;
                    }
                    for (; i < inputBytes.length; i++) {
                        outBytes[i] = inputBytes[i] ^ key;
                    }
                }

                // Convert to string in chunks
                let outStr = '';
                for (let i = 0; i < outBytes.length; i += chunkSize) {
                    const end = Math.min(i + chunkSize, outBytes.length);
                    outStr += String.fromCharCode.apply(null, outBytes.subarray(i, end));
                }

                const hexKey = key.toString(16).padStart(2, '0').toUpperCase();
                results.push({ op: `XOR(Key:0x${hexKey})`, value: outStr });
            }
            return results;
        }

        // Explicit key path
        for (const key of keysToTry) {
            const outBytes = new Uint8Array(input.length);
            const keyLen = key.length;

            for (let i = 0; i < inputBytes.length; i++) {
                outBytes[i] = inputBytes[i] ^ key[i % keyLen];
            }

            // Convert back to string in chunks
            let outStr = '';
            const chunkSize = 8192;
            for (let i = 0; i < outBytes.length; i += chunkSize) {
                const chunk = outBytes.subarray(i, Math.min(i + chunkSize, outBytes.length));
                outStr += String.fromCharCode.apply(null, chunk);
            }

            const opName = explicitKeyName ? `XOR(Key:${explicitKeyName})` : 'XOR';
            results.push({ op: opName, value: outStr });
        }

        return results;
    }
});
