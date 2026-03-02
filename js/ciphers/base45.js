window.Decoder.registerCipher('Base45', {
    testRegex: /^[0-9A-Z $%*+\-./:]+$/,
    decode: (input) => {
        const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
        let clean = input.replace(/[^0-9A-Z $%*+\-./:]/g, '');
        if (!clean) return null;
        let res = [];
        for (let i = 0; i < clean.length; i += 3) {
            let chunk = clean.substr(i, 3).split('').reverse();
            let b = 0;
            for (let j = 0; j < chunk.length; j++) {
                let idx = charset.indexOf(chunk[j]);
                if (idx === -1) return null;
                b *= 45;
                b += idx;
            }
            if (b > 65535) return null;
            if (chunk.length > 2) {
                res.push(b >> 8);
            }
            res.push(b & 0xff);
        }
        return res.length > 0 ? res.map(c => String.fromCharCode(c)).join('') : null;
    }
});
