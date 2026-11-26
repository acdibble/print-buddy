import { describe, expect, it } from 'vitest';

import { type Bitmap, dotAt, rasterize, renderBlocks, toGrayscale } from '../image.js';
import { type ImageNode, type ImageOptions, Receipt } from '../receipt.js';

/** Build an image node from grayscale rows written as strings: '#' = black, '.' = white */
function imageFrom(rows: string[], options: ImageOptions = {}): ImageNode {
  const data = rows.flatMap((row) => [...row].map((c) => (c === '#' ? 0 : 255)));
  const [node] = new Receipt()
    .image({ width: rows[0].length, height: rows.length, data }, options)
    .nodes();
  return node as ImageNode;
}

/** Read a bitmap back as rows of '#' and '.' */
function rowsOf(bitmap: Bitmap): string[] {
  return Array.from({ length: bitmap.height }, (_, y) =>
    Array.from({ length: bitmap.width }, (_, x) => (dotAt(bitmap, x, y) ? '#' : '.')).join(''),
  );
}

function blackRatio(bitmap: Bitmap): number {
  let black = 0;
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) if (dotAt(bitmap, x, y)) black++;
  }
  return black / (bitmap.width * bitmap.height);
}

describe('toGrayscale', () => {
  it('infers the channel count from the data length', () => {
    const pixel = (channels: number[]) => toGrayscale({ width: 1, height: 1, data: channels })[0];
    expect(pixel([0])).toBe(0); // gray
    expect(pixel([0, 255])).toBe(0); // gray + alpha
    expect(pixel([255, 0, 0])).toBe(76); // RGB red
    expect(pixel([0, 0, 255, 255])).toBe(29); // RGBA blue
  });

  it('composites transparent pixels onto white', () => {
    const gray = toGrayscale({
      width: 3,
      height: 1,
      data: [0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 0, 255],
    });
    expect([...gray]).toEqual([255, 127, 0]);
  });

  it('uses the given channel count', () => {
    // 2 pixels × 2 channels, which would otherwise look like 4 values for 2 pixels anyway
    const gray = toGrayscale({ width: 2, height: 1, data: [0, 0, 0, 255], channels: 2 });
    expect([...gray]).toEqual([255, 0]);
  });

  it('rejects data that does not match the size', () => {
    expect(() => toGrayscale({ width: 2, height: 2, data: [0, 0, 0] })).toThrow(
      'image() data has 3 values for 2×2 pixels; expected 1 to 4 per pixel',
    );
    expect(() => toGrayscale({ width: 2, height: 1, data: [0, 0, 0], channels: 1 })).toThrow(
      'image() data has 3 values, expected 2 (2×1×1)',
    );
    expect(() => toGrayscale({ width: 0, height: 1, data: [] })).toThrow(
      'image() width and height must be positive integers, got 0×1',
    );
  });
});

describe('Receipt.image', () => {
  it('copies the pixels, so changing them later has no effect', () => {
    const data = new Uint8Array([0, 0]);
    const receipt = new Receipt().image({ width: 2, height: 1, data });
    data[0] = 255;
    expect([...(receipt.nodes()[0] as ImageNode).gray]).toEqual([0, 0]);
  });

  it('validates options', () => {
    const image = { width: 1, height: 1, data: [0] };
    expect(() => new Receipt().image(image, { width: 0 })).toThrow(
      'image() width must be a positive integer, got 0',
    );
    expect(() => new Receipt().image(image, { threshold: 300 })).toThrow(
      'image() threshold must be between 0 and 255, got 300',
    );
  });
});

describe('rasterize', () => {
  it('packs rows MSB-first, padding each row to whole bytes', () => {
    const node = imageFrom(['#.........', '.........#'], { dither: 'threshold' });
    const { bitmap } = rasterize(node, 576);

    expect(bitmap.width).toBe(10);
    expect([...bitmap.data]).toEqual([0b1000_0000, 0, 0, 0b0100_0000]);
  });

  it('keeps the image size when it fits', () => {
    const rows = ['##..', '#..#', '..##'];
    const { bitmap } = rasterize(imageFrom(rows, { dither: 'threshold' }), 576);
    expect(rowsOf(bitmap)).toEqual(rows);
  });

  it('shrinks images wider than the paper, keeping the aspect ratio', () => {
    const node = imageFrom(['########', '########', '........', '........']);
    const { bitmap } = rasterize(node, 4);
    expect(rowsOf(bitmap)).toEqual(['####', '....']);
  });

  it('scales to the requested width, but never past the paper', () => {
    const node = imageFrom(['#.', '.#'], { dither: 'threshold', width: 4 });
    expect(rowsOf(rasterize(node, 576).bitmap)).toEqual(['##..', '##..', '..##', '..##']);
    expect(rasterize(node, 2).bitmap.width).toBe(2);
  });

  it("fills the paper with width: 'full'", () => {
    const node = imageFrom(['#.', '.#'], { dither: 'threshold', width: 'full' });
    const { bitmap } = rasterize(node, 6);
    expect(rowsOf(bitmap)).toEqual(['###...', '###...', '###...', '...###', '...###', '...###']);
  });

  it('averages areas when shrinking, so the threshold decides mid grays', () => {
    // A 2×2 checkerboard averages to 127.5
    const checker = ['#.', '.#'];
    const dark = rasterize(imageFrom(checker, { dither: 'threshold', threshold: 128 }), 1);
    const light = rasterize(imageFrom(checker, { dither: 'threshold', threshold: 127 }), 1);
    expect(rowsOf(dark.bitmap)).toEqual(['#']);
    expect(rowsOf(light.bitmap)).toEqual(['.']);
  });

  it('dithers grays into a matching share of black dots', () => {
    const gray = (level: number) => {
      const data = new Uint8Array(64 * 64).fill(level);
      return new Receipt().image({ width: 64, height: 64, data }).nodes()[0] as ImageNode;
    };
    expect(blackRatio(rasterize(gray(0), 576).bitmap)).toBe(1);
    expect(blackRatio(rasterize(gray(255), 576).bitmap)).toBe(0);
    expect(blackRatio(rasterize(gray(64), 576).bitmap)).toBeCloseTo(0.75, 1);
    expect(blackRatio(rasterize(gray(192), 576).bitmap)).toBeCloseTo(0.25, 1);
  });

  it('keeps the alignment', () => {
    expect(rasterize(imageFrom(['#'], { align: 'right' }), 576).align).toBe('right');
  });
});

describe('renderBlocks', () => {
  it('draws each 12×24 dot cell as one quadrant character', () => {
    // 24×24: upper-left and lower-right quadrants of the first cell, all of the second
    const rows = Array.from({ length: 24 }, (_, y) =>
      Array.from({ length: 24 }, (_, x) => {
        if (x >= 12) return '#';
        return x < 6 === y < 12 ? '#' : '.';
      }).join(''),
    );
    const { bitmap } = rasterize(imageFrom(rows, { dither: 'threshold' }), 576);
    expect(renderBlocks(bitmap)).toEqual(['▚█']);
  });

  it('only counts the dots a partial cell has', () => {
    // 9×1 dots: the right quadrant has only 3 columns and the lower ones none
    const { bitmap } = rasterize(imageFrom(['#########'], { dither: 'threshold' }), 576);
    expect(renderBlocks(bitmap)).toEqual(['▀']);
  });
});
