window.Decoder.registerCipher('ROT47', {
    decode: (input) => {
        let res = '';
        for (let i = 0; i < input.length; i++) {
            const c = input.charCodeAt(i);
            if (c >= 33 && c <= 126) {
                res += String.fromCharCode(33 + ((c - 33 + 47) % 94));
            } else {
                res += input.charAt(i);
            }
        }
        return res;
    }
});
