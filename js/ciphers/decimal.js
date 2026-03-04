window.Decoder.registerCipher('Decimal', {
    testRegex: /^[0-9\s,:;|]+$/,
    entropyRange: [1.0, 4.0],
    decode: (input) => {
        const parts = input.trim().split(/[\s,:;|]+/);
        if (parts.length === 0 || parts[0] === '') return null;
        let res = [];
        for (let part of parts) {
            const val = parseInt(part, 10);
            if (isNaN(val) || val < 0 || val > 255) return null;
            res.push(val);
        }
        return res.length > 0 ? String.fromCharCode(...res) : null;
    }
});
