const fs = require('fs');
const path = require('path');

// --- Mock Browser Environment ---
global.window = {};

// Load Registry
require('./js/registry.js');
// Load Scoring
require('./js/scoring.js');

// Load all Ciphers
const ciphersDir = path.join(__dirname, 'js', 'ciphers');
const ciphersFiles = fs.readdirSync(ciphersDir).filter(f => f.endsWith('.js'));
for (const file of ciphersFiles) {
    require(path.join(ciphersDir, file));
}

// Ensure operations are loaded
const Operations = global.window.Decoder.Operations;
const scoreText = global.window.Decoder.scoreText;

// --- Encoders for Generating Tests ---

function encodeBase32(str) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (let i = 0; i < str.length; i++) {
        bits += str.charCodeAt(i).toString(2).padStart(8, '0');
    }
    // Pad to multiple of 5 bits
    while (bits.length % 5 !== 0) bits += '0';
    let res = '';
    for (let i = 0; i < bits.length; i += 5) {
        res += chars[parseInt(bits.substr(i, 5), 2)];
    }
    return res;
}

function encodeBase45(str) {
    const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
    let res = '';
    // Process pairs of bytes
    for (let i = 0; i < str.length; i += 2) {
        let b = str.charCodeAt(i) << 8;
        if (i + 1 < str.length) b |= str.charCodeAt(i + 1);
        else {
            // Odd length
            b = str.charCodeAt(i);
            let c = b % 45;
            let d = Math.floor(b / 45);
            res += charset[c] + charset[d];
            continue;
        }
        let c = b % 45; b = Math.floor(b / 45);
        let d = b % 45; b = Math.floor(b / 45);
        let e = b % 45;
        res += charset[c] + charset[d] + charset[e];
    }
    return res;
}

function encodeBase58(str) {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    if (str.length === 0) return '';
    let digits = [0];
    for (let i = 0; i < str.length; i++) {
        let carry = str.charCodeAt(i);
        for (let j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = Math.floor(carry / 58);
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = Math.floor(carry / 58);
        }
    }
    let res = '';
    for (let i = 0; i < str.length && str[i] === '\0'; i++) res += '1';
    for (let i = digits.length - 1; i >= 0; i--) res += ALPHABET[digits[i]];
    return res;
}

function encodeBase62(str) {
    const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    if (str.length === 0) return '';
    let digits = [0];
    for (let i = 0; i < str.length; i++) {
        let carry = str.charCodeAt(i);
        for (let j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 62;
            carry = Math.floor(carry / 62);
        }
        while (carry > 0) {
            digits.push(carry % 62);
            carry = Math.floor(carry / 62);
        }
    }
    let res = '';
    for (let i = 0; i < str.length && str[i] === '\0'; i++) res += '0';
    for (let i = digits.length - 1; i >= 0; i--) res += ALPHABET[digits[i]];
    return res;
}

function encodeBase64(str) {
    return Buffer.from(str).toString('base64');
}

function encodeBase85(str) {
    let res = '';
    for (let i = 0; i < str.length; i += 4) {
        let tuple = 0;
        let count = 0;
        for (let j = 0; j < 4; j++) {
            if (i + j < str.length) {
                tuple = tuple * 256 + str.charCodeAt(i + j);
                count++;
            } else {
                tuple = tuple * 256;
            }
        }
        if (tuple === 0 && count === 4) {
            res += 'z';
            continue;
        }
        let chunk = [];
        let tempTuple = tuple;
        for (let k = 0; k < 5; k++) {
            chunk.push(String.fromCharCode(33 + (tempTuple % 85)));
            tempTuple = Math.floor(tempTuple / 85);
        }
        chunk.reverse();
        res += chunk.slice(0, count + 1).join('');
    }
    return `<~${res}~>`;
}

function encodeBase91(str) {
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';
    let b = 0, n = 0;
    let res = '';
    for (let i = 0; i < str.length; i++) {
        b |= str.charCodeAt(i) << n;
        n += 8;
        if (n > 13) {
            let v = b & 8191;
            if (v > 88) {
                b >>= 13;
                n -= 13;
            } else {
                v = b & 16383;
                b >>= 14;
                n -= 14;
            }
            res += ALPHABET[v % 91] + ALPHABET[Math.floor(v / 91)];
        }
    }
    if (n > 0) {
        res += ALPHABET[b % 91];
        if (n > 7 || b > 90) res += ALPHABET[Math.floor(b / 91)];
    }
    return res;
}

function encodeBase92(str) {
    const ALPHABET = "!#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_abcdefghijklmnopqrstuvwxyz{|}";
    if (str.length === 0) return '~';
    let bitstr = '';
    for (let i = 0; i < str.length; i++) bitstr += str.charCodeAt(i).toString(2).padStart(8, '0');
    let res = '';
    for (let i = 0; i < bitstr.length; i += 13) {
        if (i + 13 <= bitstr.length) {
            let v = parseInt(bitstr.substr(i, 13), 2);
            res += ALPHABET[Math.floor(v / 91)] + ALPHABET[v % 91];
        } else {
            let rem = bitstr.substr(i);
            if (rem.length <= 6) {
                rem = rem + '0'.repeat(6 - rem.length);
                let v = parseInt(rem, 2);
                res += ALPHABET[v];
            } else {
                rem = rem + '0'.repeat(13 - rem.length);
                let v = parseInt(rem, 2);
                res += ALPHABET[Math.floor(v / 91)] + ALPHABET[v % 91];
            }
        }
    }
    return res;
}

function encodeHex(str) {
    let res = '';
    for (let i = 0; i < str.length; i++) res += str.charCodeAt(i).toString(16).padStart(2, '0');
    return res;
}

function encodeDecimal(str) {
    let res = [];
    for (let i = 0; i < str.length; i++) res.push(str.charCodeAt(i));
    return res.join(' ');
}

function encodeBinary(str) {
    let res = [];
    for (let i = 0; i < str.length; i++) res.push(str.charCodeAt(i).toString(2).padStart(8, '0'));
    return res.join(' ');
}

function encodeOctal(str) {
    let res = [];
    for (let i = 0; i < str.length; i++) res.push(str.charCodeAt(i).toString(8).padStart(3, '0'));
    return res.join(' ');
}

function encodeROT13(str) {
    return str.replace(/[a-zA-Z]/g, c => {
        const base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
}

function encodeROT47(str) {
    let res = '';
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c >= 33 && c <= 126) {
            res += String.fromCharCode(33 + ((c - 33 + 47) % 94));
        } else {
            res += str.charAt(i);
        }
    }
    return res;
}

function encodeROT8000(str) {
    // Self inverting, so decoder = encoder
    return Operations['ROT8000'].decode(str);
}

function encodeReverse(str) {
    return str.split('').reverse().join('');
}

// Available encode operations
const encodeOps = {
    'Base32': encodeBase32,
    'Base45': encodeBase45,
    'Base58': encodeBase58,
    'Base62': encodeBase62,
    'Base64': encodeBase64,
    'Base85': encodeBase85,
    'Base91': encodeBase91,
    'Base92': encodeBase92,
    'Hex': encodeHex,
    'Decimal': encodeDecimal,
    'Binary': encodeBinary,
    'Octal': encodeOctal,
    'ROT13': encodeROT13,
    'ROT47': encodeROT47,
    'ROT8000': encodeROT8000,
    'Reverse': encodeReverse
};

// --- Headless Search Logic ---

async function runTestSearch(input, expectedValue, maxDepthSetting) {
    // Basic breadth-first search like the UI uses
    let queue = [{ path: [], text: input }];
    const seen = new Set([input]);
    const maxDepth = maxDepthSetting + 1; // Allow 1 extra depth to find variants
    const opsToUse = Object.keys(Operations);
    const maxBeamSize = 1000; // Large beam for safety in deep tests
    const selfInverting = new Set(['Reverse', 'ROT13', 'ROT47', 'ROT8000']);

    let bestMatch = null;

    for (let depth = 1; depth <= maxDepth; depth++) {
        if (queue.length === 0) break;
        let nextQueue = [];

        for (const item of queue) {
            // Check success
            if (item.text === expectedValue) {
                // Return on exact match
                return { success: true, path: item.path, text: item.text };
            }

            for (const opName of opsToUse) {
                const op = Operations[opName];

                // Prevent immediate reversible loops (only for self-inverting)
                if (selfInverting.has(opName) && item.path.length > 0 && item.path[item.path.length - 1] === opName) {
                    continue;
                }

                // If text is extremely large, bail early to prevent regex crashing during test
                if (item.text.length > 500000) continue;

                if (op.testRegex && !op.testRegex.test(item.text.substring(0, 5000))) continue;

                try {
                    const dec = op.decode(item.text, {});
                    if (dec && dec !== item.text && !seen.has(dec)) {
                        seen.add(dec);

                        const score = scoreText(dec, expectedValue, item.text.length);
                        const newPath = [...item.path, opName];

                        nextQueue.push({ path: newPath, text: dec, score: score });

                        if (dec === expectedValue) {
                            return { success: true, path: newPath, text: dec };
                        }
                    }
                } catch (e) { }
            }
        }

        nextQueue.sort((a, b) => b.score - a.score);
        queue = nextQueue.slice(0, maxBeamSize);
        if (queue.length > 0) {
            if (!bestMatch || queue[0].score > bestMatch.score) {
                bestMatch = queue[0];
            }
        }
    }

    return { success: false, closest: bestMatch };
}

// --- Test Generation & Execution ---

async function runTestSuite(numTests) {
    console.log(`\n================================`);
    console.log(`   Running DEEP Test Suite      `);
    console.log(`   (Depths 7-10, All Ciphers)   `);
    console.log(`================================\n`);

    let passed = 0;
    const encodeOpNames = Object.keys(encodeOps);
    const baseTarget = "FLAG{master_decoder_deep_test_";

    // Some sizes blow up exponentially (Binary, Hex etc). Keep track of bytes.
    for (let i = 1; i <= numTests; i++) {
        const originalText = baseTarget + i + "}";
        let currentText = originalText;
        let encodePath = [];

        // Depth 7 to 10
        const depth = Math.floor(Math.random() * 4) + 7;

        for (let j = 0; j < depth; j++) {
            const opName = encodeOpNames[Math.floor(Math.random() * encodeOpNames.length)];

            // Avoid loops
            if (encodePath.length > 0 && encodePath[encodePath.length - 1] === opName && ['Reverse', 'ROT13', 'ROT47', 'ROT8000'].includes(opName)) {
                j--; continue;
            }

            // Hard threshold to prevent massive out-of-memory outputs (Binary/Decimal blow up length ~8x)
            if (currentText.length > 20000 && (opName === 'Binary' || opName === 'Decimal' || opName === 'Hex' || opName === 'Octal')) {
                j--; continue;
            }

            try {
                const encodedText = encodeOps[opName](currentText);
                const decodedText = Operations[opName].decode(encodedText, {});

                if (decodedText !== currentText) {
                    j--; continue; // Ensure the step is perfectly invertible
                }

                currentText = encodedText;
                encodePath.push(opName);
            } catch (e) {
                j--; continue; // if an encoder fails (ex. bad chars for base92), try a different cipher
            }
        }

        // Expected decode path is reversed
        const expectedDecodePath = [...encodePath].reverse();

        console.log(`\n[Test Case #${i}] - Depth: ${depth} | Payload Size: ${currentText.length} bytes`);
        console.log(`Expected Path:  ${expectedDecodePath.join(' -> ')}`);

        process.stdout.write(`Result: `);

        // Perform search, pass maxDepth matching our generated depth
        const startTime = Date.now();
        const result = await runTestSearch(currentText, originalText, depth);
        const elapsed = (Date.now() - startTime) / 1000;

        if (result.success) {
            console.log(`✅ PASSED in ${elapsed}s (Found via: ${result.path.join(' -> ')})`);
            passed++;
        } else {
            console.log(`❌ FAILED in ${elapsed}s`);
            console.log(`    Ciphertext    : ${currentText.substring(0, 100).replace(/\r/g, '\\r').replace(/\n/g, '\\n')}... (length: ${currentText.length})`);
            console.log(`    Closest text  : ${result.closest ? result.closest.text.substring(0, 100).replace(/\r/g, '\\r').replace(/\n/g, '\\n') : 'None'}`);
            console.log(`    Closest diff  : ${result.closest ? result.closest.path.join(' -> ') : 'None'}`);
        }
    }

    console.log(`\n================================`);
    console.log(`   Final Results: ${passed}/${numTests} Passed (${Math.round((passed / numTests) * 100)}%)`);
    console.log(`================================\n`);
}

// Run 10 extremely deep tests
runTestSuite(10).catch(console.error);
