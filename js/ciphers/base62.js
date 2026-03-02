window.Decoder.registerCipher('Base62', {
    testRegex: /^[0-9A-Za-z\s]+$/,
    decode: (input) => {
        const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        let clean = input.replace(/\s/g, '');
        if (clean.length === 0) return '';
        let bytes = [];
        for (let i = 0; i < clean.length; i++) {
            const c = clean[i];
            if (!(ALPHABET.includes(c))) return null;
            let val = ALPHABET.indexOf(c);
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
