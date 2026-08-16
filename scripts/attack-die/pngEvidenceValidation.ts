import { inflateSync } from 'node:zlib';

export const PNG_EVIDENCE_MAX_INFLATED_BYTES = 128 * 1024 * 1024;
export const PNG_EVIDENCE_MAX_AGGREGATE_DECODED_BYTES = 1536 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const PNG_CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1)
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function fail(message: string): never {
  throw Error(message);
}

function pngCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes)
    crc = PNG_CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function paethPredictor(left: number, above: number, upperLeft: number) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance)
    return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function relativeLuminance(red: number, green: number, blue: number) {
  const channels = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export interface PngEvidenceResourceLimits {
  readonly maxInflatedBytes?: number;
}

export interface PngEvidencePreflight {
  readonly width: number;
  readonly height: number;
  readonly decodedBytes: number;
  readonly inflatedBytes: number;
}

function supportedResourceLimit(value: number | undefined, fallback: number) {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit < 1)
    fail('PNG evidence resource limit must be a positive safe integer');
  return limit;
}

export function preflightPngEvidence(
  bytes: Uint8Array,
  label: string,
  limits: PngEvidenceResourceLimits = {}
): PngEvidencePreflight {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < 33 ||
    !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  )
    fail(`${label} PNG signature or preflight framing mismatch`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerOffset = PNG_SIGNATURE.length;
  const headerLength = view.getUint32(headerOffset);
  const typeOffset = headerOffset + 4;
  const dataOffset = headerOffset + 8;
  const crcOffset = dataOffset + headerLength;
  if (
    headerLength !== 13 ||
    crcOffset + 4 > bytes.byteLength ||
    String.fromCharCode(...bytes.subarray(typeOffset, dataOffset)) !== 'IHDR' ||
    pngCrc32(bytes.subarray(typeOffset, crcOffset)) !==
      view.getUint32(crcOffset)
  )
    fail(`${label} PNG IHDR preflight mismatch`);
  const width = view.getUint32(dataOffset);
  const height = view.getUint32(dataOffset + 4);
  if (
    width < 1 ||
    height < 1 ||
    bytes[dataOffset + 8] !== 8 ||
    bytes[dataOffset + 9] !== 2 ||
    bytes[dataOffset + 10] !== 0 ||
    bytes[dataOffset + 11] !== 0 ||
    bytes[dataOffset + 12] !== 0
  )
    fail(`${label} PNG unsupported or illegal IHDR screenshot profile`);
  const rowBytes = width * 3;
  const inflatedBytes = height * (rowBytes + 1);
  const decodedBytes = width * height * 3;
  if (
    !Number.isSafeInteger(rowBytes) ||
    !Number.isSafeInteger(inflatedBytes) ||
    !Number.isSafeInteger(decodedBytes) ||
    inflatedBytes >
      supportedResourceLimit(
        limits.maxInflatedBytes,
        PNG_EVIDENCE_MAX_INFLATED_BYTES
      )
  )
    fail(`${label} PNG decoded image dimensions exceed supported profile`);
  return { width, height, decodedBytes, inflatedBytes };
}

export interface PngEvidenceContrastRegion {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PngEvidenceInspectionOptions extends PngEvidenceResourceLimits {
  readonly contrastRegion?: PngEvidenceContrastRegion;
  readonly requireReadableContent?: boolean;
  readonly expectedPreflight?: PngEvidencePreflight;
}

export interface PngEvidenceInspection extends PngEvidencePreflight {
  readonly contrastRatio?: number;
  readonly luminanceRange: number;
  readonly readableContent: boolean;
  readonly opaquePixelCount: number;
}

export function inspectPngEvidence(
  bytes: Uint8Array,
  label: string,
  options: PngEvidenceInspectionOptions = {}
): PngEvidenceInspection {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength < 57 ||
    !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  )
    fail(`${label} PNG signature or framing mismatch`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawImageData = false;
  let imageDataEnded = false;
  let sawEnd = false;
  const imageDataChunks: Uint8Array[] = [];
  let imageDataLength = 0;

  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < 12)
      fail(`${label} PNG truncated chunk framing`);
    const length = view.getUint32(offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    const nextOffset = crcOffset + 4;
    if (!Number.isSafeInteger(nextOffset) || nextOffset > bytes.byteLength)
      fail(`${label} PNG truncated chunk data`);
    const type = String.fromCharCode(...bytes.subarray(typeOffset, dataOffset));
    if (!/^[A-Za-z]{4}$/.test(type)) fail(`${label} PNG illegal chunk type`);
    if (
      pngCrc32(bytes.subarray(typeOffset, crcOffset)) !==
      view.getUint32(crcOffset)
    )
      fail(`${label} PNG ${type} CRC mismatch`);

    if (type === 'IHDR') {
      if (sawHeader || offset !== PNG_SIGNATURE.length || length !== 13)
        fail(`${label} PNG IHDR order or length mismatch`);
      width = view.getUint32(dataOffset);
      height = view.getUint32(dataOffset + 4);
      if (
        width < 1 ||
        height < 1 ||
        bytes[dataOffset + 8] !== 8 ||
        bytes[dataOffset + 9] !== 2 ||
        bytes[dataOffset + 10] !== 0 ||
        bytes[dataOffset + 11] !== 0 ||
        bytes[dataOffset + 12] !== 0
      )
        fail(`${label} PNG unsupported or illegal IHDR screenshot profile`);
      sawHeader = true;
    } else if (type === 'IDAT') {
      if (!sawHeader || sawEnd || imageDataEnded || length < 1)
        fail(`${label} PNG IDAT order or length mismatch`);
      sawImageData = true;
      imageDataLength += length;
      if (!Number.isSafeInteger(imageDataLength))
        fail(`${label} PNG IDAT length overflow`);
      imageDataChunks.push(bytes.subarray(dataOffset, crcOffset));
    } else if (type === 'IEND') {
      if (!sawHeader || !sawImageData || sawEnd || length !== 0)
        fail(`${label} PNG IEND order or length mismatch`);
      sawEnd = true;
      if (nextOffset !== bytes.byteLength)
        fail(`${label} PNG data follows IEND`);
    } else {
      fail(`${label} PNG unsupported screenshot chunk ${type}`);
    }
    if (sawImageData && type !== 'IDAT' && type !== 'IEND')
      imageDataEnded = true;
    offset = nextOffset;
    if (sawEnd) break;
  }
  if (!sawHeader || !sawImageData || !sawEnd || offset !== bytes.byteLength)
    fail(`${label} PNG incomplete IHDR/IDAT/IEND structure`);

  const preflight = preflightPngEvidence(bytes, label, options);
  if (
    preflight.width !== width ||
    preflight.height !== height ||
    (options.expectedPreflight &&
      (options.expectedPreflight.width !== preflight.width ||
        options.expectedPreflight.height !== preflight.height ||
        options.expectedPreflight.decodedBytes !== preflight.decodedBytes ||
        options.expectedPreflight.inflatedBytes !== preflight.inflatedBytes))
  )
    fail(`${label} PNG preflight/decode declaration mismatch`);

  const compressed = new Uint8Array(imageDataLength);
  let compressedOffset = 0;
  for (const chunk of imageDataChunks) {
    compressed.set(chunk, compressedOffset);
    compressedOffset += chunk.byteLength;
  }
  let inflated: Uint8Array;
  try {
    inflated = inflateSync(compressed, {
      maxOutputLength: preflight.inflatedBytes + 1,
    });
  } catch {
    fail(`${label} PNG IDAT inflate failed`);
  }
  if (inflated.byteLength !== preflight.inflatedBytes)
    fail(`${label} PNG inflated image-data length mismatch`);

  const contrastRegion = options.contrastRegion;
  if (
    contrastRegion &&
    (!Number.isSafeInteger(contrastRegion.left) ||
      !Number.isSafeInteger(contrastRegion.top) ||
      !Number.isSafeInteger(contrastRegion.width) ||
      !Number.isSafeInteger(contrastRegion.height) ||
      contrastRegion.left < 0 ||
      contrastRegion.top < 0 ||
      contrastRegion.width < 1 ||
      contrastRegion.height < 1 ||
      contrastRegion.left + contrastRegion.width > width ||
      contrastRegion.top + contrastRegion.height > height)
  )
    fail(`${label} PNG contrast region containment`);

  const rowBytes = width * 3;
  let darkest = 1;
  let lightest = 0;
  let regionDarkest = 1;
  let regionLightest = 0;
  let previous = new Uint8Array(rowBytes);
  let current = new Uint8Array(rowBytes);
  for (let row = 0; row < height; row += 1) {
    const scanlineOffset = row * (rowBytes + 1);
    const filter = inflated[scanlineOffset];
    if (filter > 4) fail(`${label} PNG illegal scanline filter`);
    current.fill(0);
    for (let column = 0; column < rowBytes; column += 1) {
      const encoded = inflated[scanlineOffset + column + 1];
      const left = column >= 3 ? current[column - 3] : 0;
      const above = previous[column];
      const upperLeft = column >= 3 ? previous[column - 3] : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : paethPredictor(left, above, upperLeft);
      current[column] = (encoded + predictor) & 0xff;
    }
    for (let column = 0; column < rowBytes; column += 3) {
      const luminance = relativeLuminance(
        current[column],
        current[column + 1],
        current[column + 2]
      );
      darkest = Math.min(darkest, luminance);
      lightest = Math.max(lightest, luminance);
      const pixel = column / 3;
      if (
        contrastRegion &&
        row >= contrastRegion.top &&
        row < contrastRegion.top + contrastRegion.height &&
        pixel >= contrastRegion.left &&
        pixel < contrastRegion.left + contrastRegion.width
      ) {
        regionDarkest = Math.min(regionDarkest, luminance);
        regionLightest = Math.max(regionLightest, luminance);
      }
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  const luminanceRange = lightest - darkest;
  const readableContent = luminanceRange > 0.01;
  if (options.requireReadableContent && !readableContent)
    fail(`${label} PNG lacks readable nontransparent content`);
  return {
    ...preflight,
    ...(contrastRegion
      ? {
          contrastRatio: (regionLightest + 0.05) / (regionDarkest + 0.05),
        }
      : {}),
    luminanceRange,
    readableContent,
    // The accepted screenshot profile is RGB truecolor and therefore every
    // decoded pixel is opaque. Alpha-bearing profiles are rejected in IHDR.
    opaquePixelCount: width * height,
  };
}

export interface PngEvidenceSequenceInput {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly contrastRegion?: PngEvidenceContrastRegion;
  readonly requireReadableContent?: boolean;
}

export interface PngEvidenceSequenceOptions extends PngEvidenceResourceLimits {
  readonly maxAggregateDecodedBytes?: number;
  readonly onInspected?: (
    path: string,
    inspection: PngEvidenceInspection
  ) => void;
}

export interface PngEvidenceSequenceResult {
  readonly aggregateDecodedBytes: number;
  readonly images: readonly (PngEvidenceInspection & {
    readonly path: string;
  })[];
}

export function validatePngEvidenceSequence(
  inputs: readonly PngEvidenceSequenceInput[],
  options: PngEvidenceSequenceOptions = {}
): PngEvidenceSequenceResult {
  if (!Array.isArray(inputs) || inputs.length < 1)
    fail('PNG evidence sequence must be a non-empty dense array');
  const aggregateLimit = supportedResourceLimit(
    options.maxAggregateDecodedBytes,
    PNG_EVIDENCE_MAX_AGGREGATE_DECODED_BYTES
  );
  const seen = new Set<string>();
  let aggregateDecodedBytes = 0;
  const preflights = inputs.map((input, index) => {
    if (
      !(index in inputs) ||
      !input ||
      typeof input.path !== 'string' ||
      !input.path ||
      seen.has(input.path)
    )
      fail(`PNG evidence sequence input ${index} schema/order mismatch`);
    seen.add(input.path);
    const preflight = preflightPngEvidence(input.bytes, input.path, options);
    aggregateDecodedBytes += preflight.decodedBytes;
    if (
      !Number.isSafeInteger(aggregateDecodedBytes) ||
      aggregateDecodedBytes > aggregateLimit
    )
      fail(
        `package aggregate decoded PNG budget exceeds ${aggregateLimit} bytes`
      );
    return preflight;
  });

  const images: (PngEvidenceInspection & { readonly path: string })[] = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const inspection = inspectPngEvidence(input.bytes, input.path, {
      maxInflatedBytes: options.maxInflatedBytes,
      contrastRegion: input.contrastRegion,
      requireReadableContent: input.requireReadableContent,
      expectedPreflight: preflights[index],
    });
    const summary = { path: input.path, ...inspection };
    images.push(summary);
    options.onInspected?.(input.path, inspection);
  }
  return { aggregateDecodedBytes, images };
}
