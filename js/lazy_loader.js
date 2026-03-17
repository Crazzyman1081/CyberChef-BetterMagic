/**
 * BetterMagic - Lazy Loader
 * 
 * Loads heavy dependencies (compression libs) only when needed
 */

window.DecoderLazyLoader = (function() {
    const loadedScripts = new Set();
    const loadingPromises = new Map();
    
    const COMPRESSION_SCRIPTS = [
        'js/vendor/zlibjs/zlib_and_gzip.min.js',
        'js/vendor/zlibjs/gunzip.min.js'
    ];
    
    function loadScript(src) {
        // Return existing promise if already loading
        if (loadingPromises.has(src)) {
            return loadingPromises.get(src);
        }
        
        // Return resolved promise if already loaded
        if (loadedScripts.has(src)) {
            return Promise.resolve();
        }
        
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            
            script.onload = () => {
                loadedScripts.add(src);
                loadingPromises.delete(src);
                resolve();
            };
            
            script.onerror = () => {
                loadingPromises.delete(src);
                reject(new Error(`Failed to load script: ${src}`));
            };
            
            document.head.appendChild(script);
        });
        
        loadingPromises.set(src, promise);
        return promise;
    }
    
    async function loadCompressionLibs() {
        console.log('[LazyLoader] Loading compression libraries...');
        
        try {
            await Promise.all(COMPRESSION_SCRIPTS.map(src => loadScript(src)));
            console.log('[LazyLoader] Compression libraries loaded successfully');
            return true;
        } catch (error) {
            console.error('[LazyLoader] Failed to load compression libraries:', error);
            return false;
        }
    }
    
    function isCompressionLibLoaded() {
        return typeof window.Zlib !== 'undefined';
    }
    
    function areCompressionOpsEnabled() {
        const ops = window.Decoder?.Operations || {};
        return ops['Gunzip']?.defaultActive || 
               ops['Zlib Inflate']?.defaultActive || 
               ops['Raw Inflate']?.defaultActive;
    }
    
    return {
        loadCompressionLibs,
        isCompressionLibLoaded,
        areCompressionOpsEnabled,
        loadScript
    };
})();
