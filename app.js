/**
 * BetterMagic - Main App Logic
 */

// Helper for UI Unblocking
const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

const ASCII_STRUCTURED_OPS = new Set([
    'Base32', 'Base45', 'Base58', 'Base62', 'Base64', 'Base85', 'Base91', 'Base92',
    'Hex', 'Binary', 'Decimal', 'Octal'
]);

function printableRatioSample(text, limit = 512) {
    const len = Math.min(text.length, limit);
    if (len === 0) return 1;
    let printable = 0;
    for (let i = 0; i < len; i++) {
        const c = text.charCodeAt(i);
        if (c >= 32 && c <= 126) printable++;
    }
    return printable / len;
}

function shannonEntropySample(text, limit = 256) {
    const len = Math.min(text.length, limit);
    if (len === 0) return 0;
    const counts = new Map();
    for (let i = 0; i < len; i++) {
        const ch = text[i];
        counts.set(ch, (counts.get(ch) || 0) + 1);
    }
    let h = 0;
    for (const n of counts.values()) {
        const p = n / len;
        h -= p * Math.log2(p);
    }
    return h;
}

function passesBranchPrefilter(opName, textPrefix) {
    if (ASCII_STRUCTURED_OPS.has(opName) && printableRatioSample(textPrefix) < 0.95) {
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
    const earlyTerminateScoreThreshold = options.earlyTerminateScoreThreshold || 10000;
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

    const selfInverting = new Set(['Reverse', 'ROT13', 'ROT47', 'ROT8000']);

    const decodeCacheByOp = new Map();
    function getCachedDecode(opName, op, text) {
        // Avoid storing giant strings in cache keys for very large branches.
        const canCache = text.length <= 50000;
        let opCache = null;
        if (canCache) {
            opCache = decodeCacheByOp.get(opName);
            if (!opCache) {
                opCache = new Map();
                decodeCacheByOp.set(opName, opCache);
            } else if (opCache.has(text)) {
                return opCache.get(text);
            }
        }
        let result = null;
        try {
            result = op.decode(text, options);
        } catch (e) {
            result = null;
        }
        if (canCache) opCache.set(text, result);
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
        pathLen: startingPath.length,
        lastOp: startingPath.length > 0 ? startingPath[startingPath.length - 1] : '',
        text: currentText,
        score: scoreText(currentText, crib, input.length)
    }];
    const allResults = [];

    // If we applied an initial sequence, that result is a valid output branch to show
    if (startingPath.length > 0) {
        allResults.push(queue[0]);
    }

    const seen = new Set([currentText]);

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

    const remainingDepth = Math.max(0, maxDepth - startingPath.length);
    let earlyTerminateTriggered = false;
    let expansionsRemaining = 0;
    let stopSearch = false;
    if (onProgress) onProgress(0, 0, remainingDepth);

    for (let depth = 1; depth <= remainingDepth; depth++) {
        if (queue.length === 0 || stopSearch) break;
        const beam = [];
        function swap(i, j) {
            const t = beam[i];
            beam[i] = beam[j];
            beam[j] = t;
        }
        function siftUp(idx) {
            while (idx > 0) {
                const parent = (idx - 1) >> 1;
                if (beam[parent].score <= beam[idx].score) break;
                swap(parent, idx);
                idx = parent;
            }
        }
        function siftDown(idx) {
            const len = beam.length;
            while (true) {
                const left = idx * 2 + 1;
                const right = left + 1;
                let smallest = idx;
                if (left < len && beam[left].score < beam[smallest].score) smallest = left;
                if (right < len && beam[right].score < beam[smallest].score) smallest = right;
                if (smallest === idx) break;
                swap(idx, smallest);
                idx = smallest;
            }
        }
        function addToBeam(candidate) {
            if (beam.length < maxBeamSize) {
                beam.push(candidate);
                siftUp(beam.length - 1);
                return;
            }
            if (candidate.score <= beam[0].score) return;
            beam[0] = candidate;
            siftDown(0);
        }

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
            if (parentLen > 500000) continue; // Avoid regex/decode blowups on extremely large branches

            const testPrefix = parentLen > 5000 ? parentText.slice(0, 5000) : parentText;
            const parentLastOp = item.lastOp;

            // Generate next states
            for (let i = 0; i < opsToUse.length; i++) {
                const opName = opsToUse[i].name;
                const op = opsToUse[i].op;
                // Prevent immediate reversible loops (only block self-inverting operations from running consecutively)
                if (selfInverting.has(opName) && parentLastOp === opName) {
                    continue; // Skip decoding the same base twice in a row if it undoes itself
                }

                // Early Regex Pruning
                if (!passesBranchPrefilter(opName, testPrefix)) continue;
                if (op.testRegex && !op.testRegex.test(testPrefix)) continue;

                if (op.isMulti) {
                    const multiRes = getCachedDecode(opName, op, parentText);
                    if (multiRes) {
                        for (const m of multiRes) {
                            if (!seen.has(m.value) && m.value !== parentText) {
                                seen.add(m.value);
                                const score = scoreText(m.value, crib, parentLen);
                                const candidate = {
                                    pathNode: createPathNode(item.pathNode, m.op),
                                    pathLen: item.pathLen + 1,
                                    lastOp: m.op,
                                    text: m.value,
                                    score: score
                                };
                                addToBeam(candidate);
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
                    if (dec && dec !== parentText && !seen.has(dec)) {
                        seen.add(dec);
                        const score = scoreText(dec, crib, parentLen);
                        const candidate = {
                            pathNode: createPathNode(item.pathNode, opName),
                            pathLen: item.pathLen + 1,
                            lastOp: opName,
                            text: dec,
                            score: score
                        };
                        addToBeam(candidate);
                        allResults.push(candidate);
                        if (crib && !earlyTerminateTriggered && score >= earlyTerminateScoreThreshold) {
                            earlyTerminateTriggered = true;
                            expansionsRemaining = postCribExpansionBudget;
                        }
                    }
                }
            }
        }

        beam.sort((a, b) => b.score - a.score);
        queue = beam;
        if (onProgress) onProgress(depth / remainingDepth, depth, remainingDepth);

        await yieldToUI();
    }

    allResults.sort((a, b) => b.score - a.score);

    const pathMaterializeLimit = Math.min(
        allResults.length,
        Math.max(0, options.resultPathMaterializeLimit ?? 30)
    );
    for (let i = 0; i < pathMaterializeLimit; i++) {
        allResults[i].path = materializePath(allResults[i].pathNode);
    }
    if (onProgress) onProgress(1, remainingDepth, remainingDepth);
    return allResults;
}

// --- UI Binding ---

document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('input-text');
    const cribText = document.getElementById('crib-text');
    const btnAllDecodes = document.getElementById('btn-all-decodes');
    const btnMagic = document.getElementById('btn-magic');
    const btnClear = document.getElementById('btn-clear');
    const outputContainer = document.getElementById('output-container');
    const statusIndicator = document.getElementById('status-indicator');
    const progressWrap = document.getElementById('progress-wrap');
    const progressBar = document.getElementById('progress-bar');
    const magicDepthInput = document.getElementById('magic-depth');
    const initialSequenceInput = document.getElementById('initial-sequence');
    const operationsToggles = document.getElementById('operations-toggles');
    const resultTemplate = document.getElementById('result-card-template');

    // Generate checkboxes from Registry
    const Operations = window.Decoder.Operations;
    const toggleCheckboxes = {};
    for (const opName of Object.keys(Operations)) {
        const label = document.createElement('label');
        label.className = 'toggle-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = opName;
        cb.checked = Operations[opName].defaultActive !== undefined ? Operations[opName].defaultActive : true;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + opName));
        operationsToggles.appendChild(label);
        toggleCheckboxes[opName] = cb;
    }

    // Buttons setup
    btnClear.addEventListener('click', () => {
        inputText.value = '';
        cribText.value = '';
        outputContainer.innerHTML = '<div class="empty-state">Enter text and choose an operation to begin.</div>';
        statusIndicator.textContent = 'Ready';
        statusIndicator.className = 'status-indicator';
        if (progressWrap) progressWrap.classList.add('hidden');
        if (progressBar) progressBar.style.width = '0%';
    });

    function displayResults(results, isAllDecodes = false) {
        outputContainer.innerHTML = '';

        if (!results || results.length === 0) {
            outputContainer.innerHTML = '<div class="empty-state">No decodes yielded printable text.</div>';
            return;
        }

        const toShow = results.slice(0, 30);

        toShow.forEach(res => {
            const clone = resultTemplate.content.cloneNode(true);
            const pathContainer = clone.querySelector('.path-badges');

            res.path.forEach((p, idx) => {
                const badge = document.createElement('span');
                badge.className = 'path-badge';
                badge.textContent = p;
                pathContainer.appendChild(badge);

                if (idx < res.path.length - 1) {
                    const arrow = document.createElement('span');
                    arrow.className = 'path-arrow';
                    arrow.textContent = '→';
                    pathContainer.appendChild(arrow);
                }
            });

            const scoreSpan = clone.querySelector('.score-badge');
            if (isAllDecodes) {
                scoreSpan.style.display = 'none';
            } else {
                const scoreFormat = res.score > 9000 ? '10000 (Crib Match)' : res.score.toFixed(2);
                scoreSpan.querySelector('.score-value').textContent = scoreFormat;

                if (res.score > 9000) scoreSpan.classList.add('high');
                else if (res.score < 0) scoreSpan.classList.add('low');
            }

            const textarea = clone.querySelector('textarea');
            textarea.value = res.text;
            if (res.isError) {
                textarea.style.color = 'var(--danger)';
                textarea.style.fontStyle = 'italic';
            }
            outputContainer.appendChild(clone);
        });
    }

    async function process(action) {
        const input = inputText.value.trim();
        const crib = cribText.value.trim();

        if (!input) {
            alert("Please enter input text.");
            return;
        }

        statusIndicator.textContent = 'Processing...';
        statusIndicator.className = 'status-indicator loading';
        if (progressWrap) progressWrap.classList.toggle('hidden', action !== 'magic');
        if (progressBar) progressBar.style.width = '0%';

        setTimeout(async () => {
            const startTime = performance.now();
            let results = [];
            let magicDepth = parseInt(magicDepthInput.value) || 10;

            const activeOps = Object.keys(toggleCheckboxes).filter(op => toggleCheckboxes[op].checked);

            let initialSeq = [];
            const seqVal = initialSequenceInput.value.trim();
            if (seqVal) {
                const opLookup = {};
                for (const opName of Object.keys(Operations)) {
                    opLookup[opName.toLowerCase()] = opName;
                }
                initialSeq = seqVal
                    .split(/[,\s]+/)
                    .map(s => s.trim().toLowerCase())
                    .filter(Boolean)
                    .map(s => opLookup[s])
                    .filter(Boolean);
            }

            const options = {
                crib: crib,
                maxDepth: magicDepth,
                activeOps: activeOps,
                initialSequence: initialSeq,
                onProgress: action === 'magic' ? (fraction, depth, totalDepth) => {
                    if (progressBar) {
                        const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
                        progressBar.style.width = `${pct}%`;
                    }
                    statusIndicator.textContent = `Processing... (${depth}/${totalDepth})`;
                } : null
            };

            if (action === 'all') {
                results = await runAllDecodes(input, options);
            } else if (action === 'magic') {
                results = await runMagic(input, options);
            }

            displayResults(results, action === 'all');

            const elapsed = (performance.now() - startTime).toFixed(1);
            statusIndicator.textContent = `Done (${results.length} results, ${elapsed}ms)`;
            statusIndicator.className = 'status-indicator';
            if (progressBar) progressBar.style.width = '100%';
            if (progressWrap) progressWrap.classList.add('hidden');
        }, 50);
    }

    btnAllDecodes.addEventListener('click', () => process('all'));
    btnMagic.addEventListener('click', () => process('magic'));
});
