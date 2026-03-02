/**
 * BetterMagic - Scoring & Heuristics
 */

const EnglishFrequencies = {
    'e': 12.7, 't': 9.1, 'a': 8.1, 'o': 7.5, 'i': 7.0, 'n': 6.7, 's': 6.3, 'h': 6.1, 'r': 6.0,
    'd': 4.3, 'l': 4.0, 'c': 2.8, 'u': 2.8, 'm': 2.4, 'w': 2.4, 'f': 2.2, 'g': 2.0, 'y': 2.0,
    'p': 1.9, 'b': 1.5, 'v': 0.98, 'k': 0.77, 'j': 0.15, 'x': 0.15, 'q': 0.09, 'z': 0.07, ' ': 15.0
};

const ASCII_SCORE_TABLE = new Array(128).fill(0);
const LEET_SCORE_TABLE = new Array(128).fill(0);

for (const [char, weight] of Object.entries(EnglishFrequencies)) {
    const code = char.charCodeAt(0);
    ASCII_SCORE_TABLE[code] = weight;
}
// Uppercase variant support without allocating lowercase copies.
for (let code = 65; code <= 90; code++) {
    ASCII_SCORE_TABLE[code] = ASCII_SCORE_TABLE[code + 32];
}

LEET_SCORE_TABLE[48] = EnglishFrequencies['o'] * 0.8; // 0 -> o
LEET_SCORE_TABLE[49] = EnglishFrequencies['i'] * 0.8; // 1 -> i
LEET_SCORE_TABLE[51] = EnglishFrequencies['e'] * 0.8; // 3 -> e
LEET_SCORE_TABLE[52] = EnglishFrequencies['a'] * 0.8; // 4 -> a
LEET_SCORE_TABLE[53] = EnglishFrequencies['s'] * 0.8; // 5 -> s
LEET_SCORE_TABLE[55] = EnglishFrequencies['t'] * 0.8; // 7 -> t

function getPrintableRatio(text) {
    if (!text || text.length === 0) return 0;

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

function scoreText(text, crib, parentLen = 0) {
    if (!text) return -1000;

    if (crib && text.includes(crib)) {
        return 10000;
    }

    const len = text.length;
    const sampleLen = Math.min(len, 2000);
    if (sampleLen === 0) return -1000;

    let printable = 0;
    let score = 0;

    for (let i = 0; i < sampleLen; i++) {
        const code = text.charCodeAt(i);
        if ((code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13) {
            printable++;
        }

        if (code < 128) {
            const englishScore = ASCII_SCORE_TABLE[code];
            if (englishScore) {
                score += englishScore;
                continue;
            }
            const leetScore = LEET_SCORE_TABLE[code];
            if (leetScore) {
                score += leetScore;
                continue;
            }
        }

        const lowerCode = (code >= 65 && code <= 90) ? code + 32 : code;
        if (lowerCode >= 97 && lowerCode <= 122) score -= 5;
        else score -= 10;
    }

    const printableRatio = printable / sampleLen;
    if (printableRatio < 0.8) {
        return -1000 + (printableRatio * 100);
    }

    score += printableRatio * 100;
    let normalized = score / Math.max(1, sampleLen);

    if (parentLen > 0 && len < parentLen) {
        const compressionRatio = parentLen / Math.max(1, len);
        if (normalized > 0) {
            normalized *= Math.min(compressionRatio, 5);
        }
    }

    return normalized;
}

// Make globally available to the main app script
window.Decoder.getPrintableRatio = getPrintableRatio;
window.Decoder.scoreText = scoreText;
