window.Decoder.registerCipher('Base64', {
    testRegex: /^[A-Za-z0-9+/=\s]+$/,
    entropyRange: [1.0, 6.1],
    decode: (input) => {
        const clean = input.replace(/[^A-Za-z0-9+/=]/g, '');
        try {
            const binary = atob(clean);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new TextDecoder().decode(bytes);
        } catch (e) { }
        try { return atob(clean); } catch (e) { return null; }
    }
});
