/**
 * Corrected Flexible Polyline Decoder for HERE Maps API
 * Based on the official HERE implementation
 */
class FlexPolylineDecoder {
    static decode(encoded) {
        const decoder = new FlexPolylineDecoder();
        return decoder.decodePolyline(encoded);
    }

    decodePolyline(encoded) {
        const decoder = this.decodeUnsignedValues(encoded);
        const header = this.decodeHeader(decoder[0], decoder[1]);

        const factorDegree = 10 ** header.precision;
        const factorZ = 10 ** header.thirdDimPrecision;
        const { thirdDim } = header;

        let lastLat = 0;
        let lastLng = 0;
        let lastZ = 0;
        const res = [];

        let i = 2;
        for (; i < decoder.length;) {
            const deltaLat = this.toSigned(decoder[i]);
            const deltaLng = this.toSigned(decoder[i + 1]);
            lastLat += deltaLat;
            lastLng += deltaLng;

            if (thirdDim) {
                const deltaZ = this.toSigned(decoder[i + 2]);
                lastZ += deltaZ;
                res.push([lastLat / factorDegree, lastLng / factorDegree, lastZ / factorZ]);
                i += 3;
            } else {
                res.push([lastLat / factorDegree, lastLng / factorDegree]);
                i += 2;
            }
        }

        if (i !== decoder.length) {
            throw new Error('Invalid encoding. Premature ending reached');
        }

        return res;
    }

    decodeChar(char) {
        const DECODING_TABLE = [
            62, -1, -1, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1, -1,
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
            22, 23, 24, 25, -1, -1, -1, -1, 63, -1, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
            36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51
        ];
        const charCode = char.charCodeAt(0);
        return DECODING_TABLE[charCode - 45];
    }

    decodeUnsignedValues(encoded) {
        let result = 0;
        let shift = 0;
        const resList = [];

        encoded.split('').forEach((char) => {
            const value = this.decodeChar(char);
            result |= (value & 0x1F) << shift;
            if ((value & 0x20) === 0) {
                resList.push(result);
                result = 0;
                shift = 0;
            } else {
                shift += 5;
            }
        });

        if (shift > 0) {
            throw new Error('Invalid encoding');
        }

        return resList;
    }

    decodeHeader(version, encodedHeader) {
        const FORMAT_VERSION = 1;
        if (version !== FORMAT_VERSION) {
            throw new Error('Invalid format version');
        }
        const headerNumber = encodedHeader;
        const precision = headerNumber & 15;
        const thirdDim = (headerNumber >> 4) & 7;
        const thirdDimPrecision = (headerNumber >> 7) & 15;
        return { precision, thirdDim, thirdDimPrecision };
    }

    toSigned(val) {
        // Decode the sign from an unsigned value
        let res = val;
        if (res & 1) {
            res = ~res;
        }
        res >>= 1;
        return res;
    }
}

// Export the corrected decoder
window.FlexPolylineDecoder = FlexPolylineDecoder;
