import type { Align, ImageNode } from './receipt.js';

/**
 * Decoded pixels, row by row, e.g. a browser `ImageData`, pngjs output, or
 * `sharp(...).raw().toBuffer({ resolveWithObject: true })` (pass `info.channels`)
 */
export interface RawImage {
  width: number;
  height: number;
  /** Pixel values from 0 to 255: gray, gray + alpha, RGB or RGBA */
  data: ArrayLike<number>;
  /** Values per pixel (default: inferred from the data length) */
  channels?: 1 | 2 | 3 | 4;
}

/**
 * How grays become black and white dots
 *
 * - `'floyd-steinberg'` spreads the rounding error to neighbouring dots, so
 *   photos and gradients keep their shading
 * - `'threshold'` prints every dot darker than the threshold black, which
 *   keeps text and line art crisp
 */
export type Dither = 'floyd-steinberg' | 'threshold';

/**
 * A 1-bit image ready to print: each row is packed into whole bytes, leftmost
 * dot in the most significant bit, and a set bit prints black
 */
export interface Bitmap {
  width: number;
  height: number;
  data: Uint8Array;
}

/** An image scaled and dithered for a particular paper width */
export type RasterNode = { kind: 'raster'; bitmap: Bitmap; align: Align };

/** Bytes per packed bitmap row */
export function bytesPerRow(width: number): number {
  return Math.ceil(width / 8);
}

/**
 * Convert pixels to grayscale (0 = black, 255 = white), compositing any
 * transparency onto white paper
 */
export function toGrayscale(image: RawImage): Uint8Array {
  const { width, height, data } = image;
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new Error(
      `image() width and height must be positive integers, got ${String(width)}×${String(height)}`,
    );
  }
  const pixels = width * height;
  const channels = image.channels ?? data.length / pixels;
  if (![1, 2, 3, 4].includes(channels)) {
    throw new Error(
      `image() data has ${String(data.length)} values for ${String(width)}×${String(height)} pixels; expected 1 to 4 per pixel`,
    );
  }
  if (data.length !== pixels * channels) {
    throw new Error(
      `image() data has ${String(data.length)} values, expected ${String(pixels * channels)} (${String(width)}×${String(height)}×${String(channels)})`,
    );
  }

  const hasColor = channels >= 3;
  const hasAlpha = channels === 2 || channels === 4;
  const gray = new Uint8Array(pixels);
  for (let i = 0; i < pixels; i++) {
    const p = i * channels;
    // Rec. 601 luma
    const luma = hasColor ? 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2] : data[p];
    const alpha = hasAlpha ? data[p + channels - 1] / 255 : 1;
    gray[i] = Math.round(luma * alpha + 255 * (1 - alpha));
  }
  return gray;
}

/**
 * Scale and dither an image node to fit a printable width in dots
 */
export function rasterize(node: ImageNode, maxWidth: number): RasterNode {
  const requested = node.printWidth === 'full' ? maxWidth : (node.printWidth ?? node.width);
  const width = Math.max(1, Math.min(requested, maxWidth));
  const height = Math.max(1, Math.round((node.height * width) / node.width));

  const scaled = resample(node.gray, node.width, node.height, width, height);
  const bitmap =
    node.dither === 'threshold'
      ? threshold(scaled, width, height, node.threshold)
      : floydSteinberg(scaled, width, height, node.threshold);

  return { kind: 'raster', bitmap, align: node.align };
}

/**
 * Resize grayscale pixels by area averaging: each output pixel is the mean of
 * the source area it covers, which keeps thin lines from vanishing when
 * shrinking
 */
function resample(
  src: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  width: number,
  height: number,
): Float32Array {
  const out = Float32Array.from(src);
  if (width === srcWidth && height === srcHeight) return out;

  const xWeights = weights(srcWidth, width);
  const rows = new Float32Array(width * srcHeight);
  for (let y = 0; y < srcHeight; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (const [i, w] of xWeights[x]) sum += out[y * srcWidth + i] * w;
      rows[y * width + x] = sum;
    }
  }

  const yWeights = weights(srcHeight, height);
  const result = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (const [i, w] of yWeights[y]) sum += rows[i * width + x] * w;
      result[y * width + x] = sum;
    }
  }
  return result;
}

/** For each output index, the source indices it covers and their weights (summing to 1) */
function weights(srcSize: number, size: number): [number, number][][] {
  const scale = srcSize / size;
  return Array.from({ length: size }, (_, i) => {
    const start = i * scale;
    const end = Math.min(srcSize, (i + 1) * scale);
    const entries: [number, number][] = [];
    for (let j = Math.floor(start); j < end; j++) {
      const overlap = Math.min(end, j + 1) - Math.max(start, j);
      if (overlap > 1e-9) entries.push([j, overlap / (end - start)]);
    }
    return entries;
  });
}

function threshold(gray: Float32Array, width: number, height: number, level: number): Bitmap {
  const bitmap = emptyBitmap(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (gray[y * width + x] < level) setDot(bitmap, x, y);
    }
  }
  return bitmap;
}

function floydSteinberg(gray: Float32Array, width: number, height: number, level: number): Bitmap {
  const bitmap = emptyBitmap(width, height);
  const values = Float32Array.from(gray);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = values[i];
      const black = old < level;
      if (black) setDot(bitmap, x, y);
      const error = old - (black ? 0 : 255);
      if (x + 1 < width) values[i + 1] += (error * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) values[i + width - 1] += (error * 3) / 16;
        values[i + width] += (error * 5) / 16;
        if (x + 1 < width) values[i + width + 1] += error / 16;
      }
    }
  }
  return bitmap;
}

function emptyBitmap(width: number, height: number): Bitmap {
  return { width, height, data: new Uint8Array(bytesPerRow(width) * height) };
}

function setDot(bitmap: Bitmap, x: number, y: number): void {
  bitmap.data[y * bytesPerRow(bitmap.width) + (x >> 3)] |= 0x80 >> (x & 7);
}

/** Whether the dot at (x, y) prints black */
export function dotAt(bitmap: Bitmap, x: number, y: number): boolean {
  return (bitmap.data[y * bytesPerRow(bitmap.width) + (x >> 3)] & (0x80 >> (x & 7))) !== 0;
}

// Quadrant block characters indexed by upper-left + 2·upper-right + 4·lower-left + 8·lower-right
const QUADRANTS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█';

/**
 * Draw a bitmap with quadrant block characters for text previews
 *
 * Each character stands for a 12×24 dot Font A cell, so the preview lines up
 * with text columns. Each quadrant (6×12 dots) is black if at least half of
 * its dots are.
 */
export function renderBlocks(bitmap: Bitmap): string[] {
  const cell = { width: 12, height: 24 };
  const quadrant = { width: cell.width / 2, height: cell.height / 2 };
  const columns = Math.ceil(bitmap.width / cell.width);
  const rows = Math.ceil(bitmap.height / cell.height);

  const isBlack = (qx: number, qy: number): boolean => {
    let black = 0;
    let total = 0;
    const x0 = qx * quadrant.width;
    const y0 = qy * quadrant.height;
    for (let y = y0; y < Math.min(y0 + quadrant.height, bitmap.height); y++) {
      for (let x = x0; x < Math.min(x0 + quadrant.width, bitmap.width); x++) {
        total++;
        if (dotAt(bitmap, x, y)) black++;
      }
    }
    return total > 0 && black * 2 >= total;
  };

  return Array.from({ length: rows }, (_, row) => {
    let line = '';
    for (let col = 0; col < columns; col++) {
      const qx = col * 2;
      const qy = row * 2;
      const index =
        (isBlack(qx, qy) ? 1 : 0) +
        (isBlack(qx + 1, qy) ? 2 : 0) +
        (isBlack(qx, qy + 1) ? 4 : 0) +
        (isBlack(qx + 1, qy + 1) ? 8 : 0);
      line += QUADRANTS[index];
    }
    return line;
  });
}
