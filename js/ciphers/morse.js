/**
 * Morse Code Cipher - From CyberChef implementation
 * Decodes International Morse Code into uppercase alphanumeric characters.
 */

window.Decoder.registerCipher('Morse', {
    testRegex: /^[-. \n]{5,}$|^[_. \n]{5,}$|^(?:dash|dot| |\n){5,}$/i,
    entropyRange: [0, 6.0],
    
    decode: (input) => {
        if (!input || typeof input !== 'string') return null;
        
        // Morse code mapping (same as CyberChef)
        const MORSE_TABLE = {
            "A": ".-",        "B": "-...",      "C": "-.-.",      "D": "-..",
            "E": ".",         "F": "..-.",      "G": "--.",       "H": "....",
            "I": "..",        "J": ".---",      "K": "-.-",       "L": ".-..",
            "M": "--",        "N": "-.",        "O": "---",       "P": ".--.",
            "Q": "--.-",      "R": ".-.",       "S": "...",       "T": "-",
            "U": "..-",       "V": "...-",      "W": ".--",       "X": "-..-",
            "Y": "-.--",      "Z": "--..",
            "1": ".----",     "2": "..---",     "3": "...--",     "4": "....-",
            "5": ".....",     "6": "-....",     "7": "--...",     "8": "---..",
            "9": "----.",     "0": "-----",
            ".": ".-.-.-",    ",": "--..--",    ":": "---...",    ";": "-.-.-.",
            "!": "-.-.--",    "?": "..--..",    "'": ".----.",    "\"": ".-..-.",
            "/": "-..-.",     "-": "-....-",    "+": ".-.-.",     "(": "-.--.",
            ")": "-.--.-",    "@": ".--.-.",    "=": "-...-",     "&": ".-...",
            "_": "..--.-",    "$": "...-..-",   " ": "......."    // 7 dots for space
        };
        
        try {
            let clean = input.trim();
            
            // Build reverse table: signal -> character
            const reverseTable = {};
            for (const letter in MORSE_TABLE) {
                const signal = MORSE_TABLE[letter];
                reverseTable[signal] = letter;
            }
            
            // Standardize dashes and dots (replace various dash/dot representations)
            clean = clean.replace(/-|‐|−|_|–|—|dash/ig, "-");
            clean = clean.replace(/\.|·|dot/ig, ".");
            
            // Split by word delimiter (slash or newline or multiple spaces)
            // CyberChef uses explicit delimiters; here we use slash (/), newline (\n), or 2+ spaces
            const words = clean.split(/\n|\/| {2,}/);
            
            const result = words.map(word => {
                if (!word) return '';
                // Split by letter delimiter (single space or multiple dots/dashes without spaces)
                // Treat each run of non-space as a signal if there are no spaces
                // If spaces exist, split on them
                let signals;
                if (word.includes(' ')) {
                    signals = word.split(/\s+/).filter(s => s.length > 0);
                } else {
                    // Need to parse continuous string of . and - into individual letters
                    // This is ambiguous; we'll treat each contiguous block of [.-]+ as one signal
                    signals = word.match(/[.-]+/g) || [];
                }
                
                const letters = signals.map(signal => {
                    return reverseTable[signal] || '';
                });
                return letters.join('');
            });
            
            return result.join(' ').toUpperCase();
        } catch (e) {
            return null;
        }
    }
});