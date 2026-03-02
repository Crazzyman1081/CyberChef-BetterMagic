window.Decoder.registerCipher('Binary', {
    testRegex: /^[01\s,:;|]+$/,
    decode: (input) => {
        let clean = input.replace(/[\s,:;|]/g, '');
        if (clean.length % 8 !== 0 || clean.length === 0) return null;
        let res = [];
        for (let i = 0; i < clean.length; i += 8) {
            const val = parseInt(clean.substr(i, 8), 2);
            if (isNaN(val) || val < 0 || val > 255) return null;
            res.push(val);
        }
        return res.length > 0 ? res.map(c => String.fromCharCode(c)).join('') : null;
    }
});
