const BASE91_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';
const BASE91_MAP = {};
for (let i = 0; i < BASE91_ALPHABET.length; i++) {
    BASE91_MAP[BASE91_ALPHABET[i]] = i;
}

window.Decoder.registerCipher('Base91', {
    testRegex: /^[A-Za-z0-9!#$%&()*+,./:;<=>?@\[\]^_`{|}~"\s]+$/,
    entropyRange: [1.0, 6.6],
    decode: (input) => {
        let b = 0, n = 0, v = -1;
        const res = [];
        for (let i = 0; i < input.length; i++) {
            const p = BASE91_MAP[input[i]];
            if (p === undefined) continue;
            if (v < 0) {
                v = p;
            } else {
                v += p * 91;
                b |= v << n;
                n += (v & 8191) > 88 ? 13 : 14;
                do {
                    res.push(b & 255);
                    b >>= 8;
                    n -= 8;
                } while (n > 7);
                v = -1;
            }
        }
        if (v > -1) {
            res.push((b | v << n) & 255);
        }
        return res.length > 0 ? res.map(c => String.fromCharCode(c)).join('') : null;
    }
});
