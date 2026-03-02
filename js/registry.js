/**
 * BetterMagic - Registry
 *
 * Provides a global registry to register ciphers modularly
 * without requiring ES Modules (which need a local web server to bypass CORS).
 */

window.Decoder = {
    Operations: {},
    registerCipher: function (name, implementation) {
        if (this.Operations[name]) {
            console.warn(`Cipher ${name} is already registered. Overwriting.`);
        }
        this.Operations[name] = implementation;
    }
};
