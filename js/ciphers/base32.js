window.Decoder.registerCipher('Base32', {
    testRegex: /^[a-z2-7=\s]+$/i,
    decode: (input) => {
        input = input.replace(/=+$/, '').replace(/\s/g, '');
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let bits = '';
        for (let i = 0; i < input.length; i++) {
            const val = chars.indexOf(input.charAt(i).toUpperCase());
            if (val === -1) return null;
            bits += val.toString(2).padStart(5, '0');
        }
        let res = '';
        for (let i = 0; i + 8 <= bits.length; i += 8) {
            res += String.fromCharCode(parseInt(bits.substr(i, 8), 2));
        }
        return res.length > 0 ? res : null;
    }
});
