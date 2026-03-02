window.Decoder.registerCipher('Base85', {
    testRegex: /^[!-uz~<>\s]+$/,
    decode: (input) => {
        let res = '';
        let str = input.replace(/\s/g, '').replace(/^<~|~>$/g, '');
        let tuple = 0;
        let count = 0;
        for (let i = 0; i < str.length; i++) {
            const c = str[i];
            if (c === 'z' && count === 0) {
                res += '\0\0\0\0';
                continue;
            }
            if (c < '!' || c > 'u') return null;
            tuple = tuple * 85 + (c.charCodeAt(0) - 33);
            count++;
            if (count === 5) {
                res += String.fromCharCode((tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255);
                tuple = 0;
                count = 0;
            }
        }
        if (count > 0) {
            if (count === 1) return null;
            tuple = tuple * Math.pow(85, 5 - count);
            let shift = 24;
            for (let i = 0; i < count - 1; i++) {
                res += String.fromCharCode((tuple >>> shift) & 255);
                shift -= 8;
            }
        }
        return res.length > 0 ? res : null;
    }
});
