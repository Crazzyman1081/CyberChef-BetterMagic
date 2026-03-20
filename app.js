/**
 * BetterMagic - Main App Logic
 */

// Helper for UI Unblocking
const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

const ASCII_STRUCTURED_OPS = new Set([
    'Base32', 'Base45', 'Base58', 'Base62', 'Base64', 'Base85', 'Base91', 'Base92',
    'Hex', 'Binary', 'Decimal', 'Octal'
]);

// --- Reusable MinHeap (Fix #2) ---
// Extracted from the per-depth loop — avoids re-declaring closures every iteration.

class MinHeap {
    constructor(maxSize) {
        this._heap = [];
        this._maxSize = maxSize;
    }

    get length() { return this._heap.length; }
    get items() { return this._heap; }

    _swap(i, j) {
        const t = this._heap[i];
        this._heap[i] = this._heap[j];
        this._heap[j] = t;
    }

    _siftUp(idx) {
        while (idx > 0) {
            const parent = (idx - 1) >> 1;
            if (this._heap[parent].score <= this._heap[idx].score) break;
            this._swap(parent, idx);
            idx = parent;
        }
    }

    _siftDown(idx) {
        const len = this._heap.length;
        while (true) {
            const left = idx * 2 + 1;
            const right = left + 1;
            let smallest = idx;
            if (left < len && this._heap[left].score < this._heap[smallest].score) smallest = left;
            if (right < len && this._heap[right].score < this._heap[smallest].score) smallest = right;
            if (smallest === idx) break;
            this._swap(idx, smallest);
            idx = smallest;
        }
    }

    push(candidate) {
        if (this._heap.length < this._maxSize) {
            this._heap.push(candidate);
            this._siftUp(this._heap.length - 1);
            return;
        }
        if (candidate.score <= this._heap[0].score) return;
        this._heap[0] = candidate;
        this._siftDown(0);
    }

    // Reset for reuse each depth level (avoids re-allocating)
    reset() {
        this._heap.length = 0;
    }

    drainSorted() {
        this._heap.sort((a, b) => b.score - a.score);
        return this._heap.slice(); // Return a copy so reset() doesn't destroy the queue
    }
}

// --- Fingerprint-based deduplication (Fix #4) ---
// Lightweight fingerprint: length + prefix + middle + suffix.
// Adding a middle sample reduces collision risk vs prefix+suffix only.

function textFingerprint(text) {
    const len = text.length;
    if (len <= 128) return text; // Short strings: store as-is
    const mid = Math.max(0, (len >>> 1) - 32);
    return len + ':' + text.slice(0, 64) + ':' + text.slice(mid, mid + 64) + ':' + text.slice(-64);
}

// --- LRU-bounded decode cache (Fix #6) ---

const MAX_CACHE_PER_OP = 1000;

function evictOldest(map) {
    // Map iteration order is insertion order — delete the first key
    const firstKey = map.keys().next().value;
    map.delete(firstKey);
}

// --- Search configuration constants ---
const SEARCH_CONFIG = {
    OUTPUT_MIN_PRINTABLE: 0.7,
    OUTPUT_MAX_ENTROPY: 7.5,
    BINARY_EXTREME_MAX_PRINTABLE: 0.3,
    BINARY_EXTREME_MIN_ENTROPY: 4.5,
    MAX_BRANCH_TEXT_LEN: 500000,
    TEST_PREFIX_LEN: 5000,
    COMPRESSION_RATIO_CAP: 5,
    PRINTABLE_RATIO_THRESHOLD: 0.95,
    SCORE_SAMPLE_LEN: 512
};

// --- Import helpers from scoring.js (avoid duplication) ---
const printableRatioSample = window.Decoder.printableRatioSample;
const shannonEntropySample = window.Decoder.shannonEntropySample;

// --- Output validation ---
// Decoded output that looks like garbage should not propagate through the search tree.

function passesOutputValidation(decodedText) {
    if (!decodedText || decodedText.length === 0) return false;
    const pr = printableRatioSample(decodedText, SEARCH_CONFIG.SCORE_SAMPLE_LEN);
    if (pr < SEARCH_CONFIG.OUTPUT_MIN_PRINTABLE) {
        return looksLikeCompressionCandidate(decodedText, pr);
    }
    if (decodedText.length > 16) {
        const entropy = shannonEntropySample(decodedText, SEARCH_CONFIG.SCORE_SAMPLE_LEN);
        if (entropy > SEARCH_CONFIG.OUTPUT_MAX_ENTROPY) return false;
    }
    return true;
}

function looksLikeCompressionCandidate(decodedText, printableRatio = null) {
    const pr = printableRatio ?? printableRatioSample(decodedText, SEARCH_CONFIG.SCORE_SAMPLE_LEN);
    if (pr > SEARCH_CONFIG.BINARY_EXTREME_MAX_PRINTABLE) return false;

    const bytes = new Uint8Array(decodedText.length);
    for (let i = 0; i < decodedText.length; i++) {
        bytes[i] = decodedText.charCodeAt(i) & 0xff;
    }

    const compressionUtils = window.DecoderCompressionUtils;
    if (compressionUtils) {
        if (compressionUtils.isGzipHeader(bytes) || compressionUtils.isZlibHeader(bytes)) {
            return true;
        }
    }

    if (decodedText.length < 16) return false;
    return shannonEntropySample(decodedText, SEARCH_CONFIG.SCORE_SAMPLE_LEN) >= SEARCH_CONFIG.BINARY_EXTREME_MIN_ENTROPY;
}

function passesBranchPrefilter(opName, textPrefix) {
    if (ASCII_STRUCTURED_OPS.has(opName) && printableRatioSample(textPrefix) < SEARCH_CONFIG.PRINTABLE_RATIO_THRESHOLD) {
        return false;
    }

    if (opName === 'Base64') {
        const clean = textPrefix.replace(/[^A-Za-z0-9+/=]/g, '');
        if (clean.length === 0) return false;
        if (clean.length % 4 !== 0) return false;
        const pad = clean.indexOf('=');
        if (pad !== -1 && !/=+$/.test(clean)) return false;
        return true;
    }

    if (opName === 'Hex') {
        const clean = textPrefix.replace(/[\s,:;|]/g, '');
        if (clean.length === 0) return false;
        return clean.length % 2 === 0;
    }

    if (opName === 'Binary') {
        const clean = textPrefix.replace(/[\s,:;|]/g, '');
        if (clean.length === 0 || clean.length % 8 !== 0) return false;

        const delimCount = (textPrefix.match(/[\s,:;|]/g) || []).length;
        if (textPrefix.length > 64 && delimCount > 0) {
            const tokens = textPrefix.trim().split(/[\s,:;|]+/).slice(0, 20);
            for (const t of tokens) {
                if (t.length !== 8) return false;
            }
        }
        return true;
    }

    if (opName === 'Decimal' || opName === 'Octal') {
        const sample = textPrefix.trim();
        if (!sample) return false;
        const delimCount = (sample.match(/[\s,:;|]/g) || []).length;
        if (sample.length > 48 && delimCount === 0) return false;

        const density = delimCount / Math.max(1, sample.length);
        if (sample.length > 128 && density < 0.01) return false;

        if (sample.length > 64 && shannonEntropySample(sample) > 4.2) return false;

        const tokens = sample.split(/[\s,:;|]+/).slice(0, 24);
        for (const t of tokens) {
            if (!t) continue;
            if (opName === 'Decimal') {
                if (t.length > 3) return false;
            } else {
                if (t.length > 3) return false;
                if (t.length === 3 && t[0] > '3') return false;
            }
        }
    }

    return true;
}

const SELF_INVERTING_OPS = new Set(['Reverse', 'ROT13', 'ROT47', 'ROT8000']);

// --- Search Logic ---

async function runAllDecodes(input, options = {}) {
    const results = [];
    const Operations = window.Decoder.Operations;
    const scoreText = window.Decoder.scoreText;
    const crib = options.crib || '';

    for (const [opName, op] of Object.entries(Operations)) {
        if (op.isMulti) {
            results.push({ path: [opName], text: "[Multi-decode operation, not applicable here]", score: -9999, isError: true });
            continue;
        }

        try {
            const dec = op.decode(input, options);
            if (dec && dec !== input) {
                results.push({ path: [opName], text: dec, score: scoreText(dec, crib, input.length), isExact: true });
            } else {
                results.push({ path: [opName], text: "[Cannot decode / Invalid format]", score: -9999, isError: true });
            }
        } catch (e) {
            results.push({ path: [opName], text: "[Error decoding]", score: -9999, isError: true });
        }
    }

    results.sort((a, b) => {
        if (!!a.isError !== !!b.isError) return a.isError ? 1 : -1;
        return b.score - a.score;
    });

    return results;
}

async function runMagic(input, options) {
    const crib = options.crib || '';
    const maxDepth = options.maxDepth || 5;
    const initialSequence = options.initialSequence || [];
    const activeOpsKeys = options.activeOps;
    const scoreText = window.Decoder.scoreText;
    const Operations = window.Decoder.Operations;
    const CRIB_MATCH_SCORE = window.Decoder.CRIB_MATCH_SCORE; // Fix #1
    const earlyTerminateScoreThreshold = options.earlyTerminateScoreThreshold || CRIB_MATCH_SCORE;
    const postCribExpansionBudget = options.postCribExpansionBudget || 150;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    let startingPath = [];
    let currentText = input;

    // Apply initial sequence first
    if (initialSequence && initialSequence.length > 0) {
        for (const opName of initialSequence) {
            const op = Operations[opName];
            if (!op) break; // Invalid operation in sequence
            try {
                const dec = op.decode(currentText, options);
                if (!dec || dec === currentText) {
                    currentText = null;
                    break; // Sequence failed to decode
                }
                currentText = dec;
                startingPath.push(opName);
            } catch (e) {
                currentText = null;
                break;
            }
        }
    }

    if (!currentText) {
        return []; // Initial sequence resulted in invalid decode
    }

    // Fix #6 — LRU-bounded decode cache
    const decodeCacheByOp = new Map();
    function getCachedDecode(opName, op, text, optionsObj = {}) {
        let opCache = decodeCacheByOp.get(opName);
        if (!opCache) {
            opCache = new Map();
            decodeCacheByOp.set(opName, opCache);
        }
        // If passing options (e.g. for XOR), mix it into the cache key
        const cacheKey = optionsObj.xorKey ? text + '|' + optionsObj.xorKey + ':' + optionsObj.xorKeyType : text;

        let result = opCache.get(cacheKey);
        if (result === undefined) {
            try {
                result = op.decode(text, optionsObj);
            } catch (e) {
                result = null;
            }
            if (!result) result = null;
            if (opCache.size >= MAX_CACHE_PER_OP) {
                evictOldest(opCache);
            }
            opCache.set(cacheKey, result);
        } else {
            // True LRU behavior: refresh recency on cache hit
            opCache.delete(cacheKey);
            opCache.set(cacheKey, result);
        }
        return result;
    }

    function createPathNode(prev, opName) {
        return { prev, op: opName, len: prev ? prev.len + 1 : 1, arr: null };
    }

    function pathFromArray(pathArr) {
        let node = null;
        for (let i = 0; i < pathArr.length; i++) {
            node = createPathNode(node, pathArr[i]);
        }
        return node;
    }

    function materializePath(node) {
        if (!node) return [];
        if (node.arr) return node.arr;
        const arr = new Array(node.len);
        let idx = node.len - 1;
        let curr = node;
        while (curr) {
            arr[idx--] = curr.op;
            curr = curr.prev;
        }
        node.arr = arr;
        return arr;
    }

    // Breadth-First Search / Beam Search
    const startPathNode = pathFromArray(startingPath);
    let queue = [{
        pathNode: startPathNode,
        normOps: startingPath.slice(),
        pathLen: startingPath.length,
        searchDepth: 0,
        lastOp: startingPath.length > 0 ? startingPath[startingPath.length - 1] : '',
        text: currentText,
        score: scoreText(currentText, crib, input.length)
    }];

    const allResults = [];

    // If we applied an initial sequence, that result is a valid output branch to show
    if (startingPath.length > 0) {
        allResults.push(queue[0]);
    }

    // Fix #4 — Fingerprint-based seen set
    const seen = new Set([textFingerprint(currentText)]);

    // Dynamic Beam Scaling: Very large texts cannot sustain wide beams.
    const textLen = input.length;
    let maxBeamSize = 1000;
    if (textLen > 1000000) maxBeamSize = 5;       // > 1MB : very narrow
    else if (textLen > 100000) maxBeamSize = 15;  // > 100KB: narrow
    else if (textLen > 10000) maxBeamSize = 50;   // > 10KB : moderate
    else if (textLen > 2000) maxBeamSize = 250;   // > 2KB  : wider

    // Default to all operations if none specified.
    const opNames = activeOpsKeys || Object.keys(Operations);
    const opsToUse = [];
    for (let i = 0; i < opNames.length; i++) {
        const name = opNames[i];
        const op = Operations[name];
        if (op) {
            opsToUse.push({ name, op });
        }
    }

    const remainingDepth = Math.max(0, maxDepth);
    let earlyTerminateTriggered = false;
    let expansionsRemaining = 0;
    let stopSearch = false;
    if (onProgress) onProgress(0, 0, remainingDepth);

    // Fix #2 — Reuse a single MinHeap instance, reset per depth
    const beam = new MinHeap(maxBeamSize);

    for (let depth = 1; depth <= remainingDepth; depth++) {
        if (queue.length === 0 || stopSearch) break;
        beam.reset();

        for (let q = 0; q < queue.length; q++) {
            const item = queue[q];
            if (earlyTerminateTriggered && expansionsRemaining <= 0) {
                stopSearch = true;
                break;
            }
            if (earlyTerminateTriggered) expansionsRemaining--;

            // Reached crib? Short circuit branch but add to results
            if (crib && item.text.includes(crib) && item.pathLen > 0) {
                allResults.push(item);
                if (!earlyTerminateTriggered && item.score >= earlyTerminateScoreThreshold) {
                    earlyTerminateTriggered = true;
                    expansionsRemaining = postCribExpansionBudget;
                }
                continue; // Stop exploring this branch, it found the crib
            }

            const parentText = item.text;
            const parentLen = parentText.length;
            if (parentLen > SEARCH_CONFIG.MAX_BRANCH_TEXT_LEN) continue; // Avoid regex/decode blowups on extremely large branches

            const testPrefix = parentLen > SEARCH_CONFIG.TEST_PREFIX_LEN ? parentText.slice(0, SEARCH_CONFIG.TEST_PREFIX_LEN) : parentText;
            const parentLastOp = item.lastOp;
            const inputEntropy = shannonEntropySample(testPrefix, 512);

            // Generate next states
            for (let i = 0; i < opsToUse.length; i++) {
                const opName = opsToUse[i].name;
                const op = opsToUse[i].op;
                // Prevent immediate reversible loops (only block self-inverting operations from running consecutively)
                if (SELF_INVERTING_OPS.has(opName) && parentLastOp === opName) {
                    continue; // Skip decoding the same base twice in a row if it undoes itself
                }

                // Early Regex Pruning
                if (!passesBranchPrefilter(opName, testPrefix)) continue;
                if (op.testRegex && !op.testRegex.test(testPrefix)) continue;

                // Entropy-based input pruning: skip if parent text entropy is outside
                // the cipher's declared range (e.g. Base64 expects entropy 1.0-6.1)
                if (op.entropyRange) {
                    if (inputEntropy < op.entropyRange[0] || inputEntropy > op.entropyRange[1]) {
                        continue;
                    }
                }

                if (op.isMulti) {
                    // Inject options into getCachedDecode for ciphers that need them (like XOR)
                    const multiRes = getCachedDecode(opName, op, parentText, options);
                    if (multiRes) {
                        for (const m of multiRes) {

                            // Prevent multiple different XOR keys in a single chain
                            // If this op is an XOR, check if we've already done an XOR with a different key
                            if (m.op.startsWith('XOR(Key:')) {
                                let validXor = true;
                                let curr = item.pathNode;
                                while (curr) {
                                    if (curr.op.startsWith('XOR(Key:') && curr.op !== m.op) {
                                        validXor = false;
                                        break;
                                    }
                                    curr = curr.prev;
                                }
                                if (!validXor) continue;
                            }

                            const fp = textFingerprint(m.value);
                            const normOps = item.normOps.concat(m.op);
                            if (!seen.has(fp) && m.value !== parentText && passesOutputValidation(m.value)) {
                                seen.add(fp);
                                const score = scoreText(m.value, crib, parentLen);
                                const candidate = {
                                    pathNode: createPathNode(item.pathNode, m.op),
                                    normOps: normOps,
                                    pathLen: item.pathLen + 1,
                                    searchDepth: item.searchDepth + 1,
                                    lastOp: m.op,
                                    text: m.value,
                                    score: score
                                };
                                beam.push(candidate);
                                allResults.push(candidate);
                                if (crib && !earlyTerminateTriggered && score >= earlyTerminateScoreThreshold) {
                                    earlyTerminateTriggered = true;
                                    expansionsRemaining = postCribExpansionBudget;
                                }
                            }
                        }
                    }
                } else {
                    const dec = getCachedDecode(opName, op, parentText);
                    if (dec && dec !== parentText) {
                        const fp = textFingerprint(dec);
                        const normOps = item.normOps.concat(opName);
                        if (!seen.has(fp) && passesOutputValidation(dec)) {
                            seen.add(fp);
                            const score = scoreText(dec, crib, parentLen);
                            const candidate = {
                                pathNode: createPathNode(item.pathNode, opName),
                                normOps: normOps,
                                pathLen: item.pathLen + 1,
                                searchDepth: item.searchDepth + 1,
                                lastOp: opName,
                                text: dec,
                                score: score
                            };
                            beam.push(candidate);
                            allResults.push(candidate);
                            if (crib && !earlyTerminateTriggered && score >= earlyTerminateScoreThreshold) {
                                earlyTerminateTriggered = true;
                                expansionsRemaining = postCribExpansionBudget;
                            }
                        }
                    }
                }
            }
        }

        queue = beam.drainSorted();
        if (onProgress) onProgress(depth / remainingDepth, depth, remainingDepth);

        await yieldToUI();
    }

    allResults.sort((a, b) => b.score - a.score);

    const pathMaterializeLimit = Math.min(
        allResults.length,
        Math.max(0, options.resultPathMaterializeLimit ?? 30)
    );
    for (let i = 0; i < pathMaterializeLimit; i++) {
        allResults[i].path = Array.isArray(allResults[i].normOps)
            ? allResults[i].normOps.slice()
            : materializePath(allResults[i].pathNode);
    }
    if (onProgress) onProgress(1, remainingDepth, remainingDepth);
    return allResults;
}

const runCrazyMagic = (window.DecoderCrazy && typeof window.DecoderCrazy.createRunCrazyMagic === 'function')
    ? window.DecoderCrazy.createRunCrazyMagic({
        yieldToUI,
        textFingerprint,
        shannonEntropySample,
        passesBranchPrefilter,
        passesOutputValidation,
        SELF_INVERTING_OPS
    })
    : async function () {
        throw new Error('Crazy mode module not loaded (missing js/crazy.js).');
    };

// --- UI Binding ---


// Expose core search APIs for UI and tooling.
window.DecoderApp = {
    runAllDecodes,
    runMagic,
    runCrazyMagic
};
