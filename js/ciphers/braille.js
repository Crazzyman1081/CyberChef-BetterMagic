/**
 * Braille Cipher - From CyberChef implementation
 * Converts six-dot braille symbols to text.
 */

// Braille lookup table from CyberChef
const BRAILLE_LOOKUP = {
    ascii: " A1B'K2L@CIF/MSP\"E3H9O6R^DJG>NTQ,*5<-U8V.%[$+X!&;:4\\0Z7(_?W]#Y)=",
    dot6:  "⠀⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟⠠⠡⠢⠣⠤⠥⠦⠧⠨⠩⠪⠫⠬⠭⠮⠯⠰⠱⠲⠳⠴⠵⠶⠷⠸⠹⠺⠻⠼⠽⠾⠿"
};

window.Decoder.registerCipher('Braille', {
    testRegex: /^[\u2800-\u28ff\s.,;:!?\'"\/\-+()@=&_$\\\[\]()#%^*|~`]+$/,
    entropyRange: [0, 6.0],
    
    decode: (input) => {
        if (!input || typeof input !== 'string') return null;
        
        try {
            // Split input into characters and map each Braille char to ASCII
            const result = input.split('').map(b => {
                const idx = BRAILLE_LOOKUP.dot6.indexOf(b);
                return idx < 0 ? b : BRAILLE_LOOKUP.ascii[idx];
            }).join('');
            
            return result || null;
        } catch (e) {
            return null;
        }
    }
});