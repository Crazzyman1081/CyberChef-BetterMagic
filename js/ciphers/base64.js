window.Decoder.registerCipher('Base64', {
    testRegex: /^[A-Za-z0-9+/=\s]+$/,
    entropyRange: [1.0, 6.1],
    decode: (input) => {
        try { return decodeURIComponent(escape(atob(input.replace(/[^A-Za-z0-9+/=]/g, '')))); } catch (e) { }
        try { return atob(input.replace(/[^A-Za-z0-9+/=]/g, '')); } catch (e) { return null; }
    }
});
