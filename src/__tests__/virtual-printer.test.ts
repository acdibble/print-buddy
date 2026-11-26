import { describe, expect, it, vi } from 'vitest';

import { UsbConnection } from '../connections/usb-connection.js';
import { bold, fontB, underline } from '../receipt.js';
import { Receipt } from '../receipt.js';
import { writtenBytes } from './helpers/usb-mock.js';
import { VirtualPrinter } from './helpers/virtual-printer.js';

vi.mock('usb', async () => (await import('./helpers/usb-mock.js')).createUsbModule());

/** Print a receipt through the real USB connection and render what comes out */
async function printVirtual(receipt: Receipt, columns = 32): Promise<string> {
  writtenBytes.length = 0;
  const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, columns);
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
