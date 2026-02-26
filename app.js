/**
 * Smart Decoder Utility - Logic
 */

// --- Base Decoders & Ciphers ---

const Operations = {
    'Base32': {
        testRegex: /^[a-z2-7=\s]+$/i,
        decode: (input) => {
            input = input.replace(/=+$/, '').replace(/\s/g, '');
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
            let bits = '';
            for (let i = 0; i < input.length; i++) {
                const val = chars.indexOf(input.charAt(i).toUpperCase());
                if (val === -1) return null;
                bits += val.toString(2).padStart(5, '0');
            }
            let res = '';
            for (let i = 0; i + 8 <= bits.length; i += 8) {
                res += String.fromCharCode(parseInt(bits.substr(i, 8), 2));
            }
            return res.length > 0 ? res : null;
        }
    },
    'Base45': {
        testRegex: /^[0-9A-Z $%*+\-./:]+$/,
        decode: (input) => {
            const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
            let clean = input.replace(/[^0-9A-Z $%*+\-./:]/g, '');
            if (!clean) return null;
            let res = [];
            for (let i = 0; i < clean.length; i += 3) {
                let chunk = clean.substr(i, 3).split('').reverse();
                let b = 0;
                for (let j = 0; j < chunk.length; j++) {
                    let idx = charset.indexOf(chunk[j]);
                    if (idx === -1) return null;
                    b *= 45;
                    b += idx;
                }
                if (b > 65535) return null;
                if (chunk.length > 2) {
                    res.push(b >> 8);
                }
                res.push(b & 0xff);
            }
            return res.length > 0 ? String.fromCharCode(...res) : null;
        }
    },
    'Base58': {
        testRegex: /^[1-9A-HJ-NP-Za-km-z\s]+$/,
        decode: (input) => {
            const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
            let clean = input.replace(/\s/g, '');
            if (clean.length === 0) return null;
            let bytes = [0];
            for (let i = 0; i < clean.length; i++) {
                const c = clean[i];
                if (!(ALPHABET.includes(c))) return null;
                let val = ALPHABET.indexOf(c);
                for (let j = 0; j < bytes.length; j++) {
                    val += bytes[j] * 58;
                    bytes[j] = val & 0xff;
                    val >>= 8;
                }
                while (val > 0) {
                    bytes.push(val & 0xff);
                    val >>= 8;
                }
            }
            for (let i = 0; i < clean.length && clean[i] === '1'; i++) bytes.push(0);
            return bytes.length > 0 ? String.fromCharCode(...bytes.reverse()) : null;
        }
    },
    'Base62': {
        testRegex: /^[0-9A-Za-z\s]+$/,
        decode: (input) => {
            const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
            let clean = input.replace(/\s/g, '');
            if (clean.length === 0) return null;
            let bytes = [0];
            for (let i = 0; i < clean.length; i++) {
                const c = clean[i];
                if (!(ALPHABET.includes(c))) return null;
                let val = ALPHABET.indexOf(c);
                for (let j = 0; j < bytes.length; j++) {
                    val += bytes[j] * 62;
                    bytes[j] = val & 0xff;
                    val >>= 8;
                }
                while (val > 0) {
                    bytes.push(val & 0xff);
                    val >>= 8;
                }
            }
            return bytes.length > 0 ? String.fromCharCode(...bytes.reverse()) : null;
        }
    },
    'Base64': {
        testRegex: /^[A-Za-z0-9+/=\s]+$/,
        decode: (input) => {
            try { return decodeURIComponent(escape(atob(input.replace(/[^A-Za-z0-9+/=]/g, '')))); } catch (e) { }
            try { return atob(input.replace(/[^A-Za-z0-9+/=]/g, '')); } catch (e) { return null; }
        }
    },
    'Base85': {
        testRegex: /^[!-uz~<>\s]+$/,
        decode: (input) => {
            let res = '';
            let str = input.replace(/\s/g, '').replace(/^<~|~>$/g, '');
            let tuple = 0;
            let count = 0;
            for (let i = 0; i < str.length; i++) {
                const c = str[i];
                if (c === 'z' && count === 0) {
                    res += '\0\0\0\0';
                    continue;
                }
                if (c < '!' || c > 'u') return null;
                tuple = tuple * 85 + (c.charCodeAt(0) - 33);
                count++;
                if (count === 5) {
                    res += String.fromCharCode((tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255);
                    tuple = 0;
                    count = 0;
                }
            }
            if (count > 0) {
                if (count === 1) return null;
                tuple = tuple * Math.pow(85, 5 - count);
                let shift = 24;
                for (let i = 0; i < count - 1; i++) {
                    res += String.fromCharCode((tuple >>> shift) & 255);
                    shift -= 8;
                }
            }
            return res.length > 0 ? res : null;
        }
    },
    'Base91': {
        testRegex: /^[A-Za-z0-9!#$%&()*+,./:;<=>?@\[\]^_`{|}~"\s]+$/,
        decode: (input) => {
            const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';
            let b = 0, n = 0, v = -1;
            let res = [];
            for (let i = 0; i < input.length; i++) {
                let p = ALPHABET.indexOf(input[i]);
                if (p === -1) continue;
                if (v < 0) {
                    v = p;
                } else {
                    v += p * 91;
                    b |= v << n;
                    n += (v & 8191) > 88 ? 13 : 14;
                    do {
                        res.push(b & 255);
                        b >>= 8;
                        n -= 8;
                    } while (n > 7);
                    v = -1;
                }
            }
            if (v > -1) {
                res.push((b | v << n) & 255);
            }
            return res.length > 0 ? String.fromCharCode(...res) : null;
        }
    },
    'Base92': {
        testRegex: /^[!#-_a-}\~\s]+$/,
        decode: (input) => {
            const ALPHABET = "!#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_abcdefghijklmnopqrstuvwxyz{|}";
            let clean = input.replace(/\s/g, '');
            if (clean === '~') return '';
            if (clean.length === 0) return null;
            let bitstr = '';
            for (let i = 0; i < Math.floor(clean.length / 2); i++) {
                let v1 = ALPHABET.indexOf(clean[2 * i]);
                let v2 = ALPHABET.indexOf(clean[2 * i + 1]);
                if (v1 === -1 || v2 === -1) return null;
                let x = v1 * 91 + v2;
                bitstr += x.toString(2).padStart(13, '0');
            }
            if (clean.length % 2 === 1) {
                let v = ALPHABET.indexOf(clean[clean.length - 1]);
                if (v === -1) return null;
                bitstr += v.toString(2).padStart(6, '0');
            }
            let res = [];
            for (let i = 0; i + 8 <= bitstr.length; i += 8) {
                res.push(parseInt(bitstr.substr(i, 8), 2));
            }
            return res.length > 0 ? String.fromCharCode(...res) : null;
        }
    },
    'Hex': {
        testRegex: /^[0-9a-fA-F\s]+$/,
        decode: (input) => {
            let clean = input.replace(/\s/g, '');
            if (clean.length % 2 !== 0) return null;
            let res = [];
            for (let i = 0; i < clean.length; i += 2) {
                let val = parseInt(clean.substr(i, 2), 16);
                if (isNaN(val)) return null;
                res.push(val);
            }
            return res.length > 0 ? String.fromCharCode(...res) : null;
        }
    },
    'Reverse': {
        decode: (input) => {
            if (!input) return null;
            return input.split('').reverse().join('');
        }
    },
    'ROT13': {
        decode: (input) => {
            return input.replace(/[a-zA-Z]/g, (c) => {
                const base = c <= 'Z' ? 65 : 97;
                return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
            });
        }
    },
    'ROT47': {
        decode: (input) => {
            let res = '';
            for (let i = 0; i < input.length; i++) {
                const c = input.charCodeAt(i);
                if (c >= 33 && c <= 126) {
                    res += String.fromCharCode(33 + ((c - 33 + 47) % 94));
                } else {
                    res += input.charAt(i);
                }
            }
            return res;
        }
    },
    'ROT8000': {
        decode: (function () {
            let rotList = null;
            return function (input) {
                if (!rotList) {
                    rotList = {};
                    const validCodePoints = {
                        "33": true, "127": false, "161": true, "5760": false, "5761": true,
                        "8192": false, "8203": true, "8232": false, "8234": true, "8239": false,
                        "8240": true, "8287": false, "8288": true, "12288": false, "12289": true,
                        "55296": false, "57344": true
                    };
                    const validIntList = [];
                    let currValid = false;
                    for (let i = 0; i < 0x10000; i++) {
                        if (validCodePoints[i] !== undefined) currValid = validCodePoints[i];
                        if (currValid) validIntList.push(i);
                    }
                    const rotateNum = validIntList.length / 2;
                    for (let i = 0; i < validIntList.length; i++) {
                        rotList[String.fromCharCode(validIntList[i])] = String.fromCharCode(validIntList[(i + rotateNum) % validIntList.length]);
                    }
                }
                let output = "";
                for (let count = 0; count < input.length; count++) {
                    output += rotList[input[count]] !== undefined ? rotList[input[count]] : input[count];
                }
                return output;
            };
        })()
    }
};

// --- Scoring & Heuristics ---

const EnglishFrequencies = {
    'e': 12.7, 't': 9.1, 'a': 8.1, 'o': 7.5, 'i': 7.0, 'n': 6.7, 's': 6.3, 'h': 6.1, 'r': 6.0,
    'd': 4.3, 'l': 4.0, 'c': 2.8, 'u': 2.8, 'm': 2.4, 'w': 2.4, 'f': 2.2, 'g': 2.0, 'y': 2.0,
    'p': 1.9, 'b': 1.5, 'v': 0.98, 'k': 0.77, 'j': 0.15, 'x': 0.15, 'q': 0.09, 'z': 0.07, ' ': 15.0
};

function getPrintableRatio(text) {
    if (!text || text.length === 0) return 0;

    // Optimization: Only sample the first 2000 characters for large texts
    const sampleLen = Math.min(text.length, 2000);
    let printable = 0;
    for (let i = 0; i < sampleLen; i++) {
        const code = text.charCodeAt(i);
        if ((code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13) {
            printable++;
        }
    }
    return printable / sampleLen;
}

function scoreText(text, crib) {
    if (!text) return -1000;

    // Exact crib match gets highest score
    if (crib && text.includes(crib)) {
        return 10000;
    }

    let score = 0;
    const len = text.length;

    // Penalize heavily for non-printable characters
    const printableRatio = getPrintableRatio(text);
    if (printableRatio < 0.8) {
        return -1000 + (printableRatio * 100);
    }

    // Boost for printable ratio
    score += printableRatio * 100;

    // Evaluate English character frequencies (Optimization: sample first 2000 chars)
    const lower = text.substring(0, 2000).toLowerCase();
    const sampleLen = lower.length;
    for (let i = 0; i < sampleLen; i++) {
        const char = lower[i];
        if (EnglishFrequencies[char]) {
            score += EnglishFrequencies[char];
        } else if (char >= 'a' && char <= 'z') {
            score -= 5;
        } else {
            score -= 10;
        }
    }

    // Normalize score by sample length
    return score / Math.max(1, sampleLen);
}

// Helper for UI Unblocking
const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

// --- Search Logic ---

async function runAllDecodes(input) {
    const results = [];

    for (const [opName, op] of Object.entries(Operations)) {
        // Skip multi-decode operations for this direct "all decodes" view
        if (op.isMulti) {
            results.push({ path: [opName], text: "[Multi-decode operation, not applicable]", score: -9999, isError: true });
            continue;
        }

        try {
            const dec = op.decode(input);
            if (dec && dec !== input) {
                results.push({ path: [opName], text: dec, score: 0, isExact: true });
            } else {
                results.push({ path: [opName], text: "[Cannot decode / Invalid format]", score: -9999, isError: true });
            }
        } catch (e) {
            results.push({ path: [opName], text: "[Error decoding]", score: -9999, isError: true });
        }
    }

    // Don't sort this list by score, just return in order of operations defined.
    return results;
}

async function runMagic(input, crib, maxDepth = 5, activeOpsKeys = null, initialSequence = []) {
    let startingPath = [];
    let currentText = input;

    // Apply initial sequence first
    if (initialSequence && initialSequence.length > 0) {
        for (const opName of initialSequence) {
            const op = Operations[opName];
            if (!op) break; // Invalid operation in sequence
            try {
                const dec = op.decode(currentText);
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

    // Breadth-First Search / Beam Search
    let queue = [{ path: startingPath, text: currentText, score: scoreText(currentText, crib) }];
    const allResults = [];

    // If we applied an initial sequence, that result is a valid output branch to show
    if (startingPath.length > 0) {
        allResults.push(queue[0]);
    }

    const seen = new Set([currentText]);

    // Dynamic Beam Scaling: Very large texts (e.g. 1MB+) cannot sustain 1000 branches allocating in memory
    const textLen = input.length;
    let maxBeamSize = 1000;
    if (textLen > 1000000) maxBeamSize = 5;       // > 1MB : very narrow
    else if (textLen > 100000) maxBeamSize = 15;  // > 100KB: narrow
    else if (textLen > 10000) maxBeamSize = 50;   // > 10KB : moderate
    else if (textLen > 2000) maxBeamSize = 250;   // > 2KB  : wider

    // Default to all operations if none specified
    const opsToUse = activeOpsKeys || Object.keys(Operations);

    // Adjust maxDepth based on how many steps we already took manually
    const remainingDepth = Math.max(0, maxDepth - startingPath.length);

    for (let depth = 1; depth <= remainingDepth; depth++) {
        if (queue.length === 0) break;

        let nextQueue = [];

        for (const item of queue) {
            // Reached crib? Short circuit branch but add to results
            if (crib && item.text.includes(crib) && item.path.length > 0) {
                allResults.push(item);
                continue; // Stop exploring this branch, it found the crib
            }

            // Generate next states
            for (const opName of opsToUse) {
                const op = Operations[opName];
                // Prevent immediate reversible loops (though bases usually don't loop like ROT)
                if (item.path.length > 0 && item.path[item.path.length - 1] === opName) {
                    continue; // Skip decoding the same base twice in a row
                }

                // Early Regex Pruning (Optimization: Only test prefix for huge strings to avoid catastrophic backtracking)
                // Test the first 5000 characters if regex applies
                if (op.testRegex) {
                    const testPrefix = item.text.length > 5000 ? item.text.substring(0, 5000) : item.text;
                    if (!op.testRegex.test(testPrefix)) continue;
                }

                if (op.isMulti) {
                    const multiRes = op.decode(item.text);
                    if (multiRes) {
                        for (const m of multiRes) {
                            if (!seen.has(m.value) && m.value !== item.text) {
                                seen.add(m.value);
                                const score = scoreText(m.value, crib);
                                const newPath = [...item.path, m.op];
                                nextQueue.push({ path: newPath, text: m.value, score: score });
                                allResults.push({ path: newPath, text: m.value, score: score });
                            }
                        }
                    }
                } else {
                    try {
                        const dec = op.decode(item.text);
                        if (dec && dec !== item.text && !seen.has(dec)) {
                            seen.add(dec);
                            const score = scoreText(dec, crib);
                            const newPath = [...item.path, opName];
                            nextQueue.push({ path: newPath, text: dec, score: score });
                            allResults.push({ path: newPath, text: dec, score: score });
                        }
                    } catch (e) { }
                }
            }
        }

        // Apply dynamic beam size pruning
        nextQueue.sort((a, b) => b.score - a.score);
        queue = nextQueue.slice(0, maxBeamSize);

        // Async yield to allow UI repaints / Cancel button events (prevents lockup)
        await yieldToUI();
        // If we found the crib with high score, we could potentially stop entirely, 
        // but user asked for up to 5 depths. We will let it continue but beam search 
        // will naturally favor good branches.
    }

    // Return sorted results, filter out exact duplicates from allResults (since we pushed them as we went)
    // Filter to only show actual changes, not the root node.
    const filtered = allResults.filter(r => r.path.length > 0);
    return filtered.sort((a, b) => b.score - a.score);
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
    const magicDepthInput = document.getElementById('magic-depth');
    const initialSequenceInput = document.getElementById('initial-sequence');
    const operationsToggles = document.getElementById('operations-toggles');
    const resultTemplate = document.getElementById('result-card-template');

    // Generate checkboxes
    const toggleCheckboxes = {};
    for (const opName of Object.keys(Operations)) {
        const label = document.createElement('label');
        label.className = 'toggle-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = opName;
        cb.checked = true;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + opName));
        operationsToggles.appendChild(label);
        toggleCheckboxes[opName] = cb;
    }

    // Buttons setup    btnClear.addEventListener('click', () => {
    inputText.value = '';
    cribText.value = '';
    outputContainer.innerHTML = '<div class="empty-state">Enter text and choose an operation to begin.</div>';
    statusIndicator.textContent = 'Ready';
    statusIndicator.className = 'status-indicator';
});

function displayResults(results, isAllDecodes = false) {
    outputContainer.innerHTML = '';

    if (!results || results.length === 0) {
        outputContainer.innerHTML = '<div class="empty-state">No decodes yielded printable text.</div>';
        return;
    }

    // Only show top 30 to not freeze UI, but could paginate
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
            scoreSpan.style.display = 'none'; // Hide score for purely showing all decodes
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

    // Small timeout to allow UI to update
    setTimeout(async () => {
        const startTime = performance.now();
        let results = [];
        let magicDepth = parseInt(magicDepthInput.value) || 5;

        // Get active operations
        const activeOps = Object.keys(toggleCheckboxes).filter(op => toggleCheckboxes[op].checked);

        // Parse initial sequence
        let initialSeq = [];
        const seqVal = initialSequenceInput.value.trim();
        if (seqVal) {
            initialSeq = seqVal.split(',').map(s => s.trim()).filter(s => Object.keys(Operations).includes(s));
        }

        if (action === 'all') {
            results = await runAllDecodes(input);
        } else if (action === 'magic') {
            results = await runMagic(input, crib, magicDepth, activeOps, initialSeq);
        }

        displayResults(results, action === 'all');

        const elapsed = (performance.now() - startTime).toFixed(1);
        statusIndicator.textContent = `Done (${results.length} results, ${elapsed}ms)`;
        statusIndicator.className = 'status-indicator';
    }, 50);
}

btnAllDecodes.addEventListener('click', () => process('all'));
btnMagic.addEventListener('click', () => process('magic'));
});
