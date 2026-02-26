const crypto = require('crypto');

function encodeBase64(str) {
    return Buffer.from(str).toString('base64');
}

function encodeHex(str) {
    return Buffer.from(str).toString('hex');
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

function encodeReverse(str) {
    return str.split('').reverse().join('');
}

const operations = [
    { name: 'Base64', fn: encodeBase64 },
    { name: 'Hex', fn: encodeHex },
    { name: 'ROT13', fn: encodeROT13 },
    { name: 'ROT47', fn: encodeROT47 },
    { name: 'Reverse', fn: encodeReverse }
];

const target = "07CTF{wow_you_did_it)";
const maxDepth = 10;

let currentText = target;
let path = [];

for (let i = 0; i < maxDepth; i++) {
    // Pick a random operation
    const op = operations[Math.floor(Math.random() * operations.length)];

    // Don't repeat the same operation consecutively if it's reversible 
    // (though in encoding it matters less, it's just cleaner)
    if (path.length > 0 && path[path.length - 1] === op.name) {
        continue;
    }

    currentText = op.fn(currentText);
    path.push(op.name);
}

console.log("Original:  " + target);
console.log("Path Used: " + path.reverse().join(" -> ")); // Reverse path so it reads like decoding steps
console.log("Encoded:   \n" + currentText);
