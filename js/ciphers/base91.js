window.Decoder.registerCipher('Base91', {
    testRegex: /^[A-Za-z0-9!#$%&()*+,./:;<=>?@\[\]^_`{|}~"\s]+$/,
    decode: (input) => {
        const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';
        let b = 0, n = 0, v = -1;
        let res = [];
        for (let i = 0; i < input.length; i++) {
            let p = ALPHABET.indexOf(input[i]);
            if (p === -1) continue;
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
