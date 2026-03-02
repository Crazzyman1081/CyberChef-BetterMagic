window.Decoder.registerCipher('Hex', {
    testRegex: /^[0-9a-fA-F\s,:;|]+$/,
    decode: (input) => {
        // Remove delimiters
        let clean = input.replace(/[\s,:;|]/g, '');
        if (clean.length % 2 !== 0 || clean.length === 0) return null;
        let res = [];
        for (let i = 0; i < clean.length; i += 2) {
            let val = parseInt(clean.substr(i, 2), 16);
            if (isNaN(val) || val < 0 || val > 255) return null;
            res.push(val);
        }
        return res.length > 0 ? res.map(c => String.fromCharCode(c)).join('') : null;
    }
});
