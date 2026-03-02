window.Decoder.registerCipher('ROT8000', {
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
});
