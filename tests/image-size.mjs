/**
 * The pixel size of an image, read out of its own bytes.
 *
 * The Optimizer checks have to know whether an image really was resized. A
 * `Content-Length` that shrank proves only that something changed, and the
 * `width` parameter in the URL proves nothing at all. So the test reads the
 * header of the file it got back.
 *
 * Only the formats Bunny Optimizer can produce are handled, plus GIF, which a
 * project may serve unchanged.
 */

/** @typedef {{ format: string, width: number, height: number }} ImageSize */

/** @param {Uint8Array} bytes */
function isPng(bytes) {
  return (
    bytes.length > 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

/** @param {Uint8Array} bytes */
function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/**
 * PNG puts the size in the IHDR chunk, which is always first.
 * @param {DataView} view
 */
function pngSize(view) {
  return { format: "png", width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * JPEG hides the size in a start-of-frame marker, somewhere after the headers.
 * @param {Uint8Array} bytes
 * @param {DataView} view
 */
function jpegSize(bytes, view) {
  let offset = 2;
  while (offset < bytes.length - 9) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    // Every SOFn marker but SOF4, SOF8, and SOF12, which are not frames.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      return {
        format: "jpeg",
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

/**
 * WebP has three shapes, and each stores the size differently.
 * @param {Uint8Array} bytes
 */
function webpSize(bytes) {
  const chunk = ascii(bytes, 12, 4);

  if (chunk === "VP8X") {
    const read24 = (at) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
    return { format: "webp", width: read24(24) + 1, height: read24(27) + 1 };
  }

  if (chunk === "VP8 ") {
    const read16 = (at) => bytes[at] | (bytes[at + 1] << 8);
    return { format: "webp", width: read16(26) & 0x3fff, height: read16(28) & 0x3fff };
  }

  if (chunk === "VP8L") {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/**
 * AVIF is an ISOBMFF file, and the size sits in an `ispe` box. Walking the box
 * tree properly is a lot of code for one number, so this finds the box.
 * @param {Uint8Array} bytes
 * @param {DataView} view
 */
function avifSize(bytes, view) {
  for (let offset = 0; offset < bytes.length - 20; offset++) {
    if (ascii(bytes, offset, 4) !== "ispe") continue;
    // Four bytes of version and flags come first.
    return {
      format: "avif",
      width: view.getUint32(offset + 8),
      height: view.getUint32(offset + 12),
    };
  }
  return null;
}

/**
 * The size of an image, or `null` when the format is not one we read.
 *
 * @param {ArrayBuffer | Uint8Array} input
 * @returns {ImageSize | null}
 */
export function imageSize(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 16) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (isPng(bytes)) return pngSize(view);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(bytes, view);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return webpSize(bytes);
  if (ascii(bytes, 0, 3) === "GIF") {
    return { format: "gif", width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (ascii(bytes, 4, 4) === "ftyp") return avifSize(bytes, view);
  return null;
}
