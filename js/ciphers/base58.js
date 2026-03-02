window.Decoder.registerCipher('Base58', {
    testRegex: /^[1-9A-HJ-NP-Za-km-z\s]+$/,
    decode: (input) => {
        const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
        let clean = input.replace(/\s/g, '');
        if (clean.length === 0) return '';
        let bytes = [];
        for (let i = 0; i < clean.length; i++) {
            const c = clean[i];
            if (!(ALPHABET.includes(c))) return null;
            let val = ALPHABET.indexOf(c);
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
