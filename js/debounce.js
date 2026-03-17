/**
 * BetterMagic - Debounce Utility
 * 
 * Prevents excessive function calls on rapid user input
 */

window.DecoderDebounce = (function() {
    function debounce(func, wait, options = {}) {
        let timeout = null;
        let lastArgs = null;
        let lastThis = null;
        let result = null;
        let lastCallTime = 0;
        
        const { leading = false, trailing = true, maxWait = null } = options;
        
        function invokeFunc(time) {
            const args = lastArgs;
            const thisArg = lastThis;
            
            lastArgs = lastThis = null;
            lastCallTime = time;
            result = func.apply(thisArg, args);
            return result;
        }
        
        function leadingEdge(time) {
            lastCallTime = time;
            timeout = setTimeout(timerExpired, wait);
            return leading ? invokeFunc(time) : result;
        }
        
        function remainingWait(time) {
            const timeSinceLastCall = time - lastCallTime;
            const timeWaiting = wait - timeSinceLastCall;
            
            return maxWait !== null
                ? Math.min(timeWaiting, maxWait - timeSinceLastCall)
                : timeWaiting;
        }
        
        function shouldInvoke(time) {
            const timeSinceLastCall = time - lastCallTime;
            
            return (lastCallTime === 0 ||
                    timeSinceLastCall >= wait ||
                    timeSinceLastCall < 0 ||
                    (maxWait !== null && timeSinceLastCall >= maxWait));
        }
        
        function timerExpired() {
            const time = Date.now();
            
            if (shouldInvoke(time)) {
                return trailingEdge(time);
            }
            
            timeout = setTimeout(timerExpired, remainingWait(time));
        }
        
        function trailingEdge(time) {
            timeout = null;
            
            if (trailing && lastArgs) {
                return invokeFunc(time);
            }
            
            lastArgs = lastThis = null;
            return result;
        }
        
        function cancel() {
            if (timeout !== null) {
                clearTimeout(timeout);
            }
            lastCallTime = 0;
            lastArgs = lastThis = timeout = null;
        }
        
        function flush() {
            return timeout === null ? result : trailingEdge(Date.now());
        }
        
        function debounced(...args) {
            const time = Date.now();
            const isInvoking = shouldInvoke(time);
            
            lastArgs = args;
            lastThis = this;
            
            if (isInvoking) {
                if (timeout === null) {
                    return leadingEdge(time);
                }
                if (maxWait !== null) {
                    timeout = setTimeout(timerExpired, wait);
                    return invokeFunc(time);
                }
            }
            
            if (timeout === null) {
                timeout = setTimeout(timerExpired, wait);
            }
            
            return result;
        }
        
        debounced.cancel = cancel;
        debounced.flush = flush;
        
        return debounced;
    }
    
    function throttle(func, wait, options = {}) {
        const { leading = true, trailing = true } = options;
        return debounce(func, wait, {
            leading,
            trailing,
            maxWait: wait
        });
    }
    
    return {
        debounce,
        throttle
    };
})();
