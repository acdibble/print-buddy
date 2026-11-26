import { describe, expect, it } from 'vitest';

import { rasterImage } from '../command.js';

const header = [0x1d, 0x76, 0x30, 0x00];

describe('rasterImage', () => {
  it('sends the header and data unchanged when there are no real-time commands', () => {
    const data = Uint8Array.from([0xff, 0x10, 0x00, 0x81]);

    expect([...rasterImage(2, 2, data)]).toEqual([...header, 2, 0, 2, 0, ...data]);
  });

  it('breaks DLE EOT, DLE ENQ and DLE DC4 in the data by dropping one dot', () => {
    const data = Uint8Array.from([0x10, 0x04, 0x10, 0x05, 0x10, 0x14, 0x10, 0x10, 0x04, 0x10]);

    expect([...rasterImage(10, 1, data).subarray(8)]).toEqual([
      0x00, 0x04, 0x00, 0x05, 0x00, 0x14, 0x10, 0x00, 0x04, 0x10,
    ]);
  });

  it("doesn't change the caller's data", () => {
    const data = Uint8Array.from([0x10, 0x04]);

    rasterImage(2, 1, data);

    expect([...data]).toEqual([0x10, 0x04]);
  });
});
