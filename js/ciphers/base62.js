const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE62_MAP = {};
for (let i = 0; i < BASE62_ALPHABET.length; i++) {
    BASE62_MAP[BASE62_ALPHABET[i]] = i;
}

window.Decoder.registerCipher('Base62', {
    testRegex: /^[0-9A-Za-z\s]+$/,
    entropyRange: [1.0, 6.0],
    decode: (input) => {
        const clean = input.replace(/\s/g, '');
        if (clean.length === 0) return '';
        const bytes = [];
        for (let i = 0; i < clean.length; i++) {
            const c = clean[i];
            const mapped = BASE62_MAP[c];
            if (mapped === undefined) return null;
            let val = mapped;
            for (let j = 0; j < bytes.length; j++) {
                val += bytes[j] * 62;
                bytes[j] = val & 0xff;
                val >>= 8;
            }
            while (val > 0) {
                bytes.push(val & 0xff);
                val >>= 8;
            }
        }
        if (bytes.length === 0) return String.fromCharCode(0);
        return bytes.reverse().map(c => String.fromCharCode(c)).join('');
    }
});
