const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_MAP = {};
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
    BASE58_MAP[BASE58_ALPHABET[i]] = i;
}

window.Decoder.registerCipher('Base58', {
    testRegex: /^[1-9A-HJ-NP-Za-km-z\s]+$/,
    entropyRange: [1.0, 5.9],
    decode: (input) => {
        const clean = input.replace(/\s/g, '');
        if (clean.length === 0) return '';
        const bytes = [];
        for (let i = 0; i < clean.length; i++) {
            const c = clean[i];
            const mapped = BASE58_MAP[c];
            if (mapped === undefined) return null;
            let val = mapped;
            for (let j = 0; j < bytes.length; j++) {
                val += bytes[j] * 58;
                bytes[j] = val & 0xff;
                val >>= 8;
            }
            while (val > 0) {
                bytes.push(val & 0xff);
                val >>= 8;
            }
        }
        for (let i = 0; i < clean.length && clean[i] === '1'; i++) bytes.push(0);
        return bytes.reverse().map(c => String.fromCharCode(c)).join('');
    }
});
