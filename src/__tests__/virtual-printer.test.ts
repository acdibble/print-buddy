import { describe, expect, it, vi } from 'vitest';

import { UsbConnection } from '../connections/usb-connection.js';
import { bold, fontB, underline } from '../receipt.js';
import { Receipt } from '../receipt.js';
import { writtenBytes } from './helpers/usb-mock.js';
import { VirtualPrinter } from './helpers/virtual-printer.js';

vi.mock('usb', async () => (await import('./helpers/usb-mock.js')).createUsbModule());

/** A black disc on white, `size` pixels square, as grayscale data */
function disc(size: number) {
  const r = size / 2;
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      data[y * size + x] = (x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= r * r ? 0 : 255;
    }
  }
  return { width: size, height: size, data };
}

/** Print a receipt through the real USB connection and render what comes out */
async function printVirtual(receipt: Receipt, columns = 32): Promise<string> {
  writtenBytes.length = 0;
  const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, columns);
  await conn.open();
  await conn.print(receipt);
  await conn.close();
  return new VirtualPrinter(columns).write(writtenBytes).render();
}

describe('VirtualPrinter', () => {
  const text = (s: string) => Array.from(Buffer.from(s, 'latin1'));

  it('wraps text that exceeds the line width', () => {
    const printer = new VirtualPrinter(8).write(text('0123456789\n'));
    expect(printer.render()).toMatchInlineSnapshot(`
      "┌────────┐
      │01234567│
      │89      │
      └────────┘ (no cut)"
    `);
  });

  it('fits more Font B characters per line', () => {
    // 8 Font A columns = 96 dots = 10 Font B characters
    const printer = new VirtualPrinter(8).write([0x1b, 0x4d, 1, ...text('0123456789AB\n')]);
    expect(printer.render()).toMatchInlineSnapshot(`
      "┌────────┐
      │0123456789│ font B
      │AB      │ font B
      └────────┘ (no cut)"
    `);
  });

  it('applies the alignment in effect when the line prints', () => {
    const printer = new VirtualPrinter(10).write([
      0x1b,
      0x61,
      1,
      ...text('abc'),
      0x1b,
      0x61,
      0,
      ...text('\n'),
    ]);
    expect(printer.render()).toMatchInlineSnapshot(`
      "┌──────────┐
      │abc       │
      └──────────┘ (no cut)"
    `);
  });

  it('warns about text that never gets a line feed', () => {
    const printer = new VirtualPrinter(10).write(text('lost'));
    expect(printer.render()).toMatchInlineSnapshot(`"⚠ text never printed (no line feed): "lost""`);
  });

  it('ignores raster images sent while text is buffered', () => {
    const image = [0x1d, 0x76, 0x30, 0, 1, 0, 1, 0, 0xff];
    const printer = new VirtualPrinter(8).write([...text('abc'), ...image, ...text('\n')]);
    expect(printer.render()).toMatchInlineSnapshot(`
      "┌────────┐
      │abc     │
      └────────┘ (no cut)
      ⚠ GS v 0 ignored while text was buffered: "abc""
    `);
  });

  it('throws on commands it does not understand', () => {
    expect(() => new VirtualPrinter(10).write([0x1b, 0x21, 0])).toThrow(
      'Unsupported command ESC 0x21 at byte 0',
    );
  });
});

describe('UsbConnection output on a virtual printer', () => {
  it('renders a complete receipt', async () => {
    const receipt = new Receipt()
      .line(bold('STORE NAME'), { align: 'center' })
      .line('123 Main St', { align: 'center' })
      .blank()
      .line(underline('Order #123'))
      .table({
        header: ['Item', 'Price'],
        rows: [
          ['Coffee', '$3.50'],
          ['Muffin', '$2.00'],
        ],
      })
      .line(bold(underline('Total: $5.50')), { align: 'right' })
      .feed()
      .cut();

    expect(await printVirtual(receipt)).toMatchInlineSnapshot(`
      "┌────────────────────────────────┐
      │           STORE NAME           │ bold
      │           123 Main St          │
      │                                │
      │Order #123                      │ underline
      │Item                       Price│
      │--------------------------------│
      │Coffee                     $3.50│
      │Muffin                     $2.00│
      │                    Total: $5.50│ bold+underline
      │                                │
      │                                │
      │                                │
      │                                │
      └────────────────────────────────┘ ✂ cut"
    `);
  });

  it('renders character styles', async () => {
    const receipt = new Receipt()
      .line(bold('Bold'))
      .line(underline('Underline'))
      .line(underline('Thick', 'thick'))
      .line(bold(underline('Both')))
      .line(fontB('Font B fits more characters on a line'))
      .partialCut();

    expect(await printVirtual(receipt)).toMatchInlineSnapshot(`
      "┌────────────────────────────────┐
      │Bold                            │ bold
      │Underline                       │ underline
      │Thick                           │ thick underline
      │Both                            │ bold+underline
      │Font B fits more characters on a line│ font B
      └╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘ ✂ partial cut"
    `);
  });

  it('renders upside-down text', async () => {
    const receipt = new Receipt()
      .line('Upside down', { flip: true })
      .line('Normal')
      .line(bold('Flipped + centered'), { align: 'center', flip: true })
      .cut();

    expect(await printVirtual(receipt)).toMatchInlineSnapshot(`
      "┌────────────────────────────────┐
      │                     Upside down│ upside-down
      │Normal                          │
      │       Flipped + centered       │ upside-down · bold
      └────────────────────────────────┘ ✂ cut"
    `);
  });

  it('renders mixed styles on one line', async () => {
    const receipt = new Receipt()
      .line(['Total: ', bold('$5.50')])
      .line(['Order ', underline('#123'), ' ', fontB('(online)')], { align: 'right' })
      .cut();

    expect(await printVirtual(receipt)).toMatchInlineSnapshot(`
      "┌────────────────────────────────┐
      │Total: $5.50                    │ bold "$5.50"
      │               Order #123 (online)│ underline "#123" · font B "(online)"
      └────────────────────────────────┘ ✂ cut"
    `);
  });

  it('keeps an outer style after a nested one ends', async () => {
    const receipt = new Receipt()
      .line(bold(['a', bold('b'), 'c']))
      .line(underline(['a', underline('b', 'thick'), 'c']))
      .line(fontB(['a', fontB('b'), 'c']))
      .cut();

    expect(await printVirtual(receipt)).toMatchInlineSnapshot(`
      "┌────────────────────────────────┐
      │abc                             │ bold
      │abc                             │ underline "a" · thick underline "b" · underline "c"
      │abc                             │ font B
      └────────────────────────────────┘ ✂ cut"
    `);
  });

  it('renders images with their alignment', async () => {
    const receipt = new Receipt()
      .line('Logo', { align: 'center' })
      .image(disc(96), { align: 'center' })
      .image(disc(48), { align: 'right' })
      .line('Left')
      .cut();

    expect(await printVirtual(receipt)).toMatchInlineSnapshot(`
      "┌────────────────────────────────┐
      │              Logo              │
      │             ▄████▄             │ image 96×96
      │            ▟██████▙            │
      │            ▜██████▛            │
      │             ▀████▀             │
      │                            ▟██▙│ image 48×48
      │                            ▜██▛│
      │Left                            │
      └────────────────────────────────┘ ✂ cut"
    `);
  });

  it("doesn't send real-time commands hidden in image data", async () => {
    // Rows that pack to 10 04 02 10 | 05 10 14 00, with 10 05 across the row boundary
    const rows = [
      [0x10, 0x04, 0x02, 0x10],
      [0x05, 0x10, 0x14, 0x00],
    ];
    const data = new Uint8Array(32 * 2).fill(255);
    rows.forEach((bytes, y) =>
      bytes.forEach((byte, b) => {
        for (let bit = 0; bit < 8; bit++) {
          if (byte & (0x80 >> bit)) data[y * 32 + b * 8 + bit] = 0;
        }
      }),
    );

    writtenBytes.length = 0;
    const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32);
    await conn.open();
    await conn.print(new Receipt().image({ width: 32, height: 2, data }, { dither: 'threshold' }));

    const start = writtenBytes.findIndex(
      (b, i) => b === 0x1d && writtenBytes[i + 1] === 0x76 && writtenBytes[i + 2] === 0x30,
    );
    expect(writtenBytes.slice(start + 8, start + 16)).toEqual([
      0x00, 0x04, 0x02, 0x00, 0x05, 0x00, 0x14, 0x00,
    ]);
  });

  it('sends tall images in bands that print as one image', async () => {
    writtenBytes.length = 0;
    const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32);
    await conn.open();
    const data = new Uint8Array(16 * 600);
    await conn.print(
      new Receipt().image({ width: 16, height: 600, data }, { dither: 'threshold' }),
    );

    const headers = writtenBytes
      .map((_, i) => writtenBytes.slice(i, i + 8))
      .filter((h) => h[0] === 0x1d && h[1] === 0x76 && h[2] === 0x30);
    // GS v 0 m xL xH yL yH: 2 bytes per row, 256 + 256 + 88 rows
    expect(headers).toEqual([
      [0x1d, 0x76, 0x30, 0, 2, 0, 0, 1],
      [0x1d, 0x76, 0x30, 0, 2, 0, 0, 1],
      [0x1d, 0x76, 0x30, 0, 2, 0, 88, 0],
    ]);

    const printer = new VirtualPrinter(32).write(writtenBytes);
    expect(printer.paper).toHaveLength(1);
    expect(printer.paper[0]).toMatchObject({ kind: 'image', bitmap: { width: 16, height: 600 } });
    expect(printer.warnings).toEqual([]);
  });

  it('shrinks images to the paper width', async () => {
    const receipt = new Receipt().image(disc(96), { width: 'full' });
    expect(await printVirtual(receipt, 4)).toMatchInlineSnapshot(`
      "┌────┐
      │▟██▙│ image 48×48
      │▜██▛│
      └────┘ (no cut)"
    `);
  });

  it('does not leak alignment into the next line', async () => {
    const receipt = new Receipt().line('Centered', { align: 'center' }).line('Left').cut();

    expect(await printVirtual(receipt)).toMatchInlineSnapshot(`
      "┌────────────────────────────────┐
      │            Centered            │
      │Left                            │
      └────────────────────────────────┘ ✂ cut"
    `);
  });
});
