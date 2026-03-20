(function () {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', async () => {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((registration) => registration.unregister()));

            if (window.caches && typeof window.caches.keys === 'function') {
                const keys = await window.caches.keys();
                await Promise.all(keys.map((key) => window.caches.delete(key)));
            }
        } catch (error) {
            console.log('[App] Service worker cleanup failed:', error);
        }
    });
})();
