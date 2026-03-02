window.Decoder.registerCipher('Reverse', {
    decode: (input) => {
        if (!input) return null;
        let result = '';
        for (let i = input.length - 1; i >= 0; i--) {
            const c = input.charCodeAt(i);
            if (i > 0 && c >= 0xdc00 && c <= 0xdfff) {
                const c2 = input.charCodeAt(i - 1);
                if (c2 >= 0xd800 && c2 <= 0xdbff) {
                    result += input.charAt(i - 1) + input.charAt(i);
                    i--;
                    continue;
                }
            }
            result += input.charAt(i);
        }
        return result;
    }
});
