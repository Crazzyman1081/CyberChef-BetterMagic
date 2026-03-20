/* eslint-disable no-restricted-globals */
// Worker for heavy decode/search logic to keep UI responsive.
(function () {
    // Provide window-like globals for existing scripts.
    self.window = self;
    self.app = self.app || { options: { attemptHighlight: false } };

    // Load core registry, scoring, compression libs, ciphers, and search logic.
    importScripts(
        'registry.js',
        'scoring.js',
        'ciphers/compression_utils.js',
        'ciphers/base32.js',
        'ciphers/base45.js',
        'ciphers/base58.js',
        'ciphers/base62.js',
        'ciphers/base64.js',
        'ciphers/base85.js',
        'ciphers/base91.js',
        'ciphers/base92.js',
        'ciphers/binary.js',
        'ciphers/decimal.js',
        'ciphers/hex.js',
        'ciphers/octal.js',
        'ciphers/reverse.js',
        'ciphers/rot13.js',
        'ciphers/rot47.js',
        'ciphers/rot8000.js',
        'ciphers/gunzip.js',
        'ciphers/zlib_inflate.js',
        'ciphers/xor.js',
        'crazy.js',
        '../app.js'
    );

    function respond(id, payload) {
        self.postMessage({ id, ...payload });
    }

    self.onmessage = async (event) => {
        const { id, action, input, options } = event.data || {};
        if (!id || !action) return;

        try {
            if (!self.DecoderApp) {
                throw new Error('DecoderApp not initialized in worker.');
            }

            if (action === 'all') {
                const results = await self.DecoderApp.runAllDecodes(input, options || {});
                respond(id, { type: 'result', results });
                return;
            }

            if (action === 'magic') {
                const opts = { ...(options || {}) };
                opts.onProgress = (fraction, depth, totalDepth) => {
                    respond(id, {
                        type: 'progress',
                        progress: { fraction, depth, totalDepth }
                    });
                };
                const results = await self.DecoderApp.runMagic(input, opts);
                respond(id, { type: 'result', results });
                return;
            }

            if (action === 'crazy') {
                const opts = { ...(options || {}) };
                opts.onProgress = (meta) => {
                    respond(id, { type: 'progress', progress: meta });
                };
                opts.onCandidateUpdate = (meta) => {
                    respond(id, { type: 'candidate', progress: meta });
                };
                const payload = await self.DecoderApp.runCrazyMagic(input, opts);
                respond(id, { type: 'result', results: payload.results || [], payload });
                return;
            }

            throw new Error(`Unknown action: ${action}`);
        } catch (err) {
            respond(id, { type: 'error', message: err?.message || String(err) });
        }
    };
})();
