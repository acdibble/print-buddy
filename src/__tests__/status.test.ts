import { describe, expect, it } from 'vitest';

import { describeStatus, parseOfflineCause, ReplyReader } from '../status.js';

describe('ReplyReader', () => {
  it('reads a process ID response split across reads', () => {
    const reader = new ReplyReader();

    expect(reader.push(Uint8Array.from([0x37, 0x22, 0x30]))).toEqual([]);
    expect(reader.push(Uint8Array.from([0x30, 0x30, 0x37, 0x00]))).toEqual([
      { kind: 'process-id', id: '0007' },
    ]);
  });

  it('returns real-time status bytes and skips automatic status', () => {
    const reader = new ReplyReader();

    // DLE EOT reply, ASB block (cover open), XON, then another DLE EOT reply
    const replies = reader.push(Uint8Array.from([0x16, 0x3c, 0x00, 0x00, 0x0f, 0x11, 0x12]));

    expect(replies).toEqual([
      { kind: 'real-time', byte: 0x16 },
      { kind: 'real-time', byte: 0x12 },
    ]);
  });

  it('waits for the rest of an automatic status block', () => {
    const reader = new ReplyReader();

    expect(reader.push(Uint8Array.from([0x14, 0x00]))).toEqual([]);
    expect(reader.push(Uint8Array.from([0x00, 0x0f, 0x16]))).toEqual([
      { kind: 'real-time', byte: 0x16 },
    ]);
  });

  it('skips other response blocks and gives up on one that never ends', () => {
    const reader = new ReplyReader();

    expect(reader.push(Uint8Array.from([0x37, 0x25, 0x00, 0x16]))).toEqual([
      { kind: 'real-time', byte: 0x16 },
    ]);
    expect(reader.push(new Uint8Array([0x5f, ...new Array<number>(63).fill(0x41)]))).toEqual([]);
    expect(reader.push(Uint8Array.from([0x16]))).toEqual([{ kind: 'real-time', byte: 0x16 }]);
  });

  it('forgets partial replies when cleared', () => {
    const reader = new ReplyReader();

    reader.push(Uint8Array.from([0x37, 0x22, 0x30]));
    reader.clear();

    expect(reader.push(Uint8Array.from([0x16]))).toEqual([{ kind: 'real-time', byte: 0x16 }]);
  });
});

describe('parseOfflineCause', () => {
  it('reads the bits a TM-T20III reported', () => {
    expect(parseOfflineCause(0x12)).toEqual({ coverOpen: false, paperEnd: false, error: false });
    expect(parseOfflineCause(0x16)).toEqual({ coverOpen: true, paperEnd: false, error: false });
    expect(parseOfflineCause(0x32)).toEqual({ coverOpen: false, paperEnd: true, error: false });
    expect(parseOfflineCause(0x52)).toEqual({ coverOpen: false, paperEnd: false, error: true });
  });

  it('describes the cause', () => {
    expect(describeStatus(parseOfflineCause(0x16))).toBe('cover open');
    expect(describeStatus(parseOfflineCause(0x76))).toBe('cover open, out of paper, printer error');
    expect(describeStatus(parseOfflineCause(0x12))).toBe('printer reports no problem');
  });
});
