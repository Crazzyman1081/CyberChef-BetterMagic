window.Decoder.registerCipher('Base92', {
    testRegex: /^[!#-_a-}]+$/,
    decode: (input) => {
        const clean = input;
        if (clean.length === 0) return '';

        function base92Ord(ch) {
            if (ch === '!') return 0;
            if (ch >= '#' && ch <= '_') return ch.charCodeAt(0) - '#'.charCodeAt(0) + 1;
            if (ch >= 'a' && ch <= '}') return ch.charCodeAt(0) - 'a'.charCodeAt(0) + 62;
            return -1;
        }

        let bitstr = '';
        let res = [];
        for (let i = 0; i < clean.length; i += 2) {
            if (i + 1 !== clean.length) {
                const v1 = base92Ord(clean[i]);
                const v2 = base92Ord(clean[i + 1]);
                if (v1 < 0 || v2 < 0) return null;
                const x = v1 * 91 + v2;
                bitstr += x.toString(2).padStart(13, '0');
            } else {
                const v = base92Ord(clean[i]);
                if (v < 0) return null;
                bitstr += v.toString(2).padStart(6, '0');
            }

            while (bitstr.length >= 8) {
                res.push(parseInt(bitstr.slice(0, 8), 2));
                bitstr = bitstr.slice(8);
            }
        }
        return res.map(c => String.fromCharCode(c)).join('');
    }
});
