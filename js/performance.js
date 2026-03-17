/**
 * BetterMagic - Performance Monitoring Utility
 * 
 * Lightweight performance tracking for optimization insights
 */

window.DecoderPerf = {
    marks: new Map(),
    measures: [],
    
    mark(name) {
        this.marks.set(name, performance.now());
    },
    
    measure(name, startMark, endMark) {
        const start = this.marks.get(startMark);
        const end = endMark ? this.marks.get(endMark) : performance.now();
        
        if (start !== undefined && end !== undefined) {
            const duration = end - start;
            this.measures.push({ name, duration, timestamp: Date.now() });
            
            // Keep only last 100 measurements
            if (this.measures.length > 100) {
                this.measures.shift();
            }
            
            return duration;
        }
        return null;
    },
    
    getStats(measureName) {
        const filtered = this.measures.filter(m => m.name === measureName);
        if (filtered.length === 0) return null;
        
        const durations = filtered.map(m => m.duration);
        const sum = durations.reduce((a, b) => a + b, 0);
        const avg = sum / durations.length;
        const min = Math.min(...durations);
        const max = Math.max(...durations);
        
        return { count: filtered.length, avg, min, max, total: sum };
    },
    
    clear() {
        this.marks.clear();
        this.measures = [];
    },
    
    report() {
        const uniqueNames = [...new Set(this.measures.map(m => m.name))];
        const report = {};
        
        for (const name of uniqueNames) {
            report[name] = this.getStats(name);
        }
        
        return report;
    }
};
