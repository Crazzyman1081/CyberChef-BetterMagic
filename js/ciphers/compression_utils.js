/**
 * Compression Utilities - Shared helper functions for compression ciphers
 */

window.DecoderCompressionUtils = (function () {
    const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
    const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
    const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
    const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
    const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

    let fixedLiteralTree = null;
    let fixedDistanceTree = null;

    function stringToBytes(str) {
        const len = str.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = str.charCodeAt(i) & 0xff;
        }
        return bytes;
    }

    function bytesToString(bytes) {
        const len = bytes.length;
        const chars = new Array(len);
        for (let i = 0; i < len; i++) {
            chars[i] = String.fromCharCode(bytes[i]);
        }
        return chars.join('');
    }

    function isGzipHeader(bytes) {
        return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    }

    function isZlibHeader(bytes) {
        if (bytes.length < 2) return false;
        const cmf = bytes[0];
        const flg = bytes[1];
        if ((cmf & 0x0f) !== 8) return false;
        return ((cmf * 256 + flg) % 31) === 0;
    }

    function looksCompressed(bytes) {
        if (bytes.length < 4) return false;
        let nonPrintable = 0;
        const sampleLimit = Math.min(bytes.length, 256);
        for (let i = 0; i < sampleLimit; i++) {
            const b = bytes[i];
            if (b < 32 || (b > 126 && b !== 9 && b !== 10 && b !== 13)) {
                nonPrintable++;
            }
        }
        return nonPrintable / sampleLimit > 0.4;
    }

    function BitReader(bytes, start, end) {
        this.bytes = bytes;
        this.pos = start || 0;
        this.end = end || bytes.length;
        this.bitBuf = 0;
        this.bitCount = 0;
    }

    BitReader.prototype.readBits = function (n) {
        while (this.bitCount < n) {
            if (this.pos >= this.end) throw new Error('Unexpected end of compressed data');
            this.bitBuf |= this.bytes[this.pos++] << this.bitCount;
            this.bitCount += 8;
        }
        const value = this.bitBuf & ((1 << n) - 1);
        this.bitBuf >>>= n;
        this.bitCount -= n;
        return value;
    };

    BitReader.prototype.alignByte = function () {
        this.bitBuf = 0;
        this.bitCount = 0;
    };

    function buildHuffmanTree(lengths) {
        let maxBits = 0;
        for (let i = 0; i < lengths.length; i++) {
            if (lengths[i] > maxBits) maxBits = lengths[i];
        }
        if (maxBits === 0) throw new Error('Invalid Huffman tree');

        const blCount = new Uint16Array(maxBits + 1);
        for (let i = 0; i < lengths.length; i++) {
            if (lengths[i] > 0) blCount[lengths[i]]++;
        }

        const nextCode = new Uint32Array(maxBits + 1);
        let code = 0;
        for (let bits = 1; bits <= maxBits; bits++) {
            code = (code + blCount[bits - 1]) << 1;
            nextCode[bits] = code;
        }

        const root = {};
        for (let symbol = 0; symbol < lengths.length; symbol++) {
            const len = lengths[symbol];
            if (!len) continue;
            let curr = root;
            const currCode = nextCode[len]++;
            for (let bitIndex = 0; bitIndex < len; bitIndex++) {
                const bit = (currCode >> (len - 1 - bitIndex)) & 1;
                if (bit === 0) {
                    curr.zero = curr.zero || {};
                    curr = curr.zero;
                } else {
                    curr.one = curr.one || {};
                    curr = curr.one;
                }
            }
            curr.sym = symbol;
        }
        return root;
    }

    function decodeSymbol(reader, tree) {
        let node = tree;
        while (node.sym === undefined) {
            node = reader.readBits(1) ? node.one : node.zero;
            if (!node) throw new Error('Invalid Huffman code');
        }
        return node.sym;
    }

    function ensureFixedTrees() {
        if (fixedLiteralTree && fixedDistanceTree) return;

        const literalLengths = new Uint8Array(288);
        for (let i = 0; i <= 143; i++) literalLengths[i] = 8;
        for (let i = 144; i <= 255; i++) literalLengths[i] = 9;
        for (let i = 256; i <= 279; i++) literalLengths[i] = 7;
        for (let i = 280; i <= 287; i++) literalLengths[i] = 8;

        const distanceLengths = new Uint8Array(32);
        distanceLengths.fill(5);

        fixedLiteralTree = buildHuffmanTree(literalLengths);
        fixedDistanceTree = buildHuffmanTree(distanceLengths);
    }

    function inflateStoredBlock(reader, out) {
        reader.alignByte();
        if (reader.pos + 4 > reader.end) throw new Error('Unexpected end of stored block');

        const len = reader.bytes[reader.pos] | (reader.bytes[reader.pos + 1] << 8);
        const nlen = reader.bytes[reader.pos + 2] | (reader.bytes[reader.pos + 3] << 8);
        reader.pos += 4;

        if (((len ^ 0xffff) & 0xffff) !== nlen) throw new Error('Invalid stored block length');
        if (reader.pos + len > reader.end) throw new Error('Stored block overruns input');

        for (let i = 0; i < len; i++) out.push(reader.bytes[reader.pos++]);
    }

    function inflateHuffmanBlock(reader, literalTree, distanceTree, out) {
        while (true) {
            const sym = decodeSymbol(reader, literalTree);
            if (sym < 256) {
                out.push(sym);
                continue;
            }
            if (sym === 256) break;
            if (sym > 285) throw new Error('Invalid length symbol');

            const lenIndex = sym - 257;
            let length = LENGTH_BASE[lenIndex];
            const lenExtra = LENGTH_EXTRA[lenIndex];
            if (lenExtra) length += reader.readBits(lenExtra);

            const distSym = decodeSymbol(reader, distanceTree);
            if (distSym > 29) throw new Error('Invalid distance symbol');

            let distance = DIST_BASE[distSym];
            const distExtra = DIST_EXTRA[distSym];
            if (distExtra) distance += reader.readBits(distExtra);
            if (distance > out.length) throw new Error('Invalid back-reference distance');

            for (let i = 0; i < length; i++) {
                out.push(out[out.length - distance]);
            }
        }
    }

    function inflateDynamicBlock(reader, out) {
        const hlit = reader.readBits(5) + 257;
        const hdist = reader.readBits(5) + 1;
        const hclen = reader.readBits(4) + 4;

        const codeLenLengths = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) {
            codeLenLengths[CODE_LENGTH_ORDER[i]] = reader.readBits(3);
        }

        const codeLenTree = buildHuffmanTree(codeLenLengths);
        const total = hlit + hdist;
        const lengths = new Uint8Array(total);

        for (let i = 0; i < total;) {
            const sym = decodeSymbol(reader, codeLenTree);
            if (sym < 16) {
                lengths[i++] = sym;
                continue;
            }
            if (sym === 16) {
                if (i === 0) throw new Error('Repeat code with no previous length');
                const repeat = reader.readBits(2) + 3;
                const prev = lengths[i - 1];
                lengths.fill(prev, i, i + repeat);
                i += repeat;
                continue;
            }
            if (sym === 17) {
                const repeat = reader.readBits(3) + 3;
                lengths.fill(0, i, i + repeat);
                i += repeat;
                continue;
            }
            if (sym === 18) {
                const repeat = reader.readBits(7) + 11;
                lengths.fill(0, i, i + repeat);
                i += repeat;
                continue;
            }
            throw new Error('Invalid code length symbol');
        }

        const literalLengths = lengths.slice(0, hlit);
        const distanceLengths = lengths.slice(hlit);
        let hasDistance = false;
        for (let i = 0; i < distanceLengths.length; i++) {
            if (distanceLengths[i] !== 0) {
                hasDistance = true;
                break;
            }
        }
        if (!hasDistance) distanceLengths[0] = 1;

        const literalTree = buildHuffmanTree(literalLengths);
        const distanceTree = buildHuffmanTree(distanceLengths);
        inflateHuffmanBlock(reader, literalTree, distanceTree, out);
    }

    function inflateRaw(bytes, start, end) {
        const reader = new BitReader(bytes, start || 0, end || bytes.length);
        const out = [];
        let finalBlock = 0;

        while (!finalBlock) {
            finalBlock = reader.readBits(1);
            const blockType = reader.readBits(2);
            if (blockType === 0) {
                inflateStoredBlock(reader, out);
            } else if (blockType === 1) {
                ensureFixedTrees();
                inflateHuffmanBlock(reader, fixedLiteralTree, fixedDistanceTree, out);
            } else if (blockType === 2) {
                inflateDynamicBlock(reader, out);
            } else {
                throw new Error('Reserved deflate block type');
            }
        }

        return new Uint8Array(out);
    }

    function inflateZlib(bytes) {
        if (!isZlibHeader(bytes) || bytes.length < 6) throw new Error('Invalid zlib stream');
        const cmf = bytes[0];
        if ((cmf >> 4) > 7) throw new Error('Invalid zlib window size');
        if (bytes[1] & 0x20) throw new Error('Preset dictionary not supported');
        return inflateRaw(bytes, 2, bytes.length - 4);
    }

    return {
        stringToBytes,
        bytesToString,
        isGzipHeader,
        isZlibHeader,
        looksCompressed,
        inflateRaw,
        inflateZlib
    };
})();
