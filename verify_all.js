const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
global.window = { Decoder: {} };
require('./js/registry.js');
const ciphersDir = path.join(__dirname, 'js', 'ciphers');
fs.readdirSync(ciphersDir).forEach(f => {
    if (f.endsWith('.js')) require(path.join(ciphersDir, f));
});
const Operations = global.window.Decoder.Operations;

// Load encoders
const evalTarget = fs.readFileSync('./generate_test.js', 'utf8').split('// --- Headless Search Logic ---')[0].replace('global.window = {};', '');
const encodeOps = eval(evalTarget + ';\nencodeOps;');

let fails = [];
const numTests = 1000;
for (let op of Object.keys(Operations)) {
    if (op === 'XOR') continue;
    const encodeFn = encodeOps[op];
    const decodeFn = Operations[op].decode;
    if (!encodeFn || !decodeFn) continue;

    for (let i = 0; i < numTests; i++) {
        const testStr = crypto.randomBytes(32).toString('binary');
        try {
            const enc = encodeFn(testStr);
            const dec = decodeFn(enc);
            if (dec !== testStr) {
                fails.push(`FAIL: ${op}. Input length: ${testStr.length}, Decoded length: ${dec ? dec.length : 'null'}.\nExpected: ${Buffer.from(testStr, 'binary').toString('hex')}\nGot     : ${dec ? Buffer.from(dec, 'binary').toString('hex') : 'null'}`);
                break;
            }
        } catch (e) {
            fails.push(`ERROR: ${op}. ${e.message}`);
            break;
        }
    }
}
if (fails.length === 0) console.log("ALL PASSED");
else console.log(fails.join('\n'));
