/**
 * BetterMagic - Scoring & Heuristics
 */

const CRIB_MATCH_SCORE = 10000;

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
        return CRIB_MATCH_SCORE;
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

    // --- Structural pattern bonuses ---
    // These detect meaningful content that character-frequency alone misses.
    normalized += computeStructuralBonus(text, sampleLen);

    return normalized;
}

// -----------------------------------------------------------------------
// Structural bonuses — fast string checks, no heavy regex
// -----------------------------------------------------------------------

const URL_PROTOCOLS = ['https://', 'http://', 'ftp://', 'ftps://', 'ssh://', 'ws://', 'wss://'];
const URL_TLDS = [
    '.com', '.net', '.org', '.io', '.in', '.co', '.us', '.uk', '.de', '.fr',
    '.ru', '.cn', '.jp', '.au', '.dev', '.app', '.xyz', '.me', '.info',
    '.edu', '.gov', '.mil', '.biz'
];

// Common CTF flag prefixes — case insensitive matching
const FLAG_PREFIXES = [
    'flag{', 'ctf{', 'picoctf{', 'htb{', 'thm{', 'hack{',
    'root{', 'cyber{', 'key{', 'secret{', 'ans{', 'answer{',
    'shell{', 'pwn{', 'rev{', 'crypto{', 'misc{', 'forensics{',
    'web{', 'osint{', 'stego{'
];

function computeStructuralBonus(text, sampleLen) {
    let bonus = 0;
    const sample = sampleLen < text.length ? text.slice(0, sampleLen) : text;
    const lower = sample.toLowerCase();

    // ----- 1. URL / Link detection -----
    for (let i = 0; i < URL_PROTOCOLS.length; i++) {
        if (lower.includes(URL_PROTOCOLS[i])) {
            bonus += 200;
            break; // one match is enough
        }
    }
    for (let i = 0; i < URL_TLDS.length; i++) {
        // Look for TLD followed by end of string, path separator, or whitespace
        const tld = URL_TLDS[i];
        const idx = lower.indexOf(tld);
        if (idx > 0) {
            const afterTld = idx + tld.length;
            if (afterTld >= lower.length || '/? \t\n\r'.includes(lower[afterTld])) {
                bonus += 100;
                break;
            }
        }
    }

    // ----- 2. CTF flag format: word{...} -----
    const braceOpen = sample.indexOf('{');
    const braceClose = sample.lastIndexOf('}');
    if (braceOpen > 0 && braceClose > braceOpen) {
        // Something in curly braces with a prefix word — likely a flag
        bonus += 80;

        // Extra boost if it matches a known CTF flag prefix
        for (let i = 0; i < FLAG_PREFIXES.length; i++) {
            if (lower.includes(FLAG_PREFIXES[i])) {
                bonus += 300; // Very strong signal
                break;
            }
        }
    }

    // ----- 3. Email address pattern -----
    // Look for @ surrounded by word characters — cheap check
    const atIdx = sample.indexOf('@');
    if (atIdx > 0 && atIdx < sample.length - 3) {
        const dotAfter = sample.indexOf('.', atIdx);
        if (dotAfter > atIdx + 1) {
            bonus += 80;
        }
    }

    // ----- 4. File path detection -----
    if (lower.includes('c:\\') || lower.includes('/usr/') || lower.includes('/etc/') ||
        lower.includes('/home/') || lower.includes('/var/') || lower.includes('/tmp/') ||
        lower.includes('/bin/') || lower.includes('/opt/')) {
        bonus += 100;
    }

    // Common file extensions
    if (/\.(txt|pdf|png|jpg|jpeg|gif|exe|zip|tar|gz|py|js|html|css|json|xml|csv|log|sh|bat|ps1|doc|docx|md)\b/i.test(sample)) {
        bonus += 60;
    }

    // ----- 5. JSON / XML structure -----
    const trimmed = sample.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        // Likely JSON
        bonus += 80;
    }
    if ((trimmed.startsWith('<?xml') || trimmed.startsWith('<html') ||
        trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<svg'))) {
        bonus += 80;
    }

    // ----- 6. Word boundary bonus -----
    // Text with spaces between words is much more likely to be meaningful.
    // Count space-separated tokens in a small prefix.
    const wordSample = sample.slice(0, 256);
    const spaceCount = wordSample.split(' ').length - 1;
    if (spaceCount >= 2) {
        // Multiple words — strong natural language signal
        const wordDensity = spaceCount / Math.max(1, wordSample.length);
        // English text has about 1 space per 5 chars (density ~0.2)
        if (wordDensity > 0.05 && wordDensity < 0.5) {
            bonus += Math.min(spaceCount * 8, 120);
        }
    }

    // ----- 7. Common protocol / scheme prefixes -----
    if (lower.startsWith('data:') || lower.startsWith('mailto:') ||
        lower.startsWith('tel:') || lower.startsWith('magnet:')) {
        bonus += 120;
    }

    // ----- 8. Hash / token detection -----
    // MD5 (32 hex), SHA1 (40 hex), SHA256 (64 hex) — useful for CTF
    if (/^[a-f0-9]{32}$/i.test(trimmed) || /^[a-f0-9]{40}$/i.test(trimmed) ||
        /^[a-f0-9]{64}$/i.test(trimmed)) {
        bonus += 60;
    }

    // Normalize bonus relative to text length so it blends with the per-char score
    return bonus / Math.max(1, sampleLen);
}

// Make globally available to the main app script
window.Decoder.CRIB_MATCH_SCORE = CRIB_MATCH_SCORE;
window.Decoder.getPrintableRatio = getPrintableRatio;
window.Decoder.scoreText = scoreText;
