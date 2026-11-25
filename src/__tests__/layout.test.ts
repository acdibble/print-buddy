import { describe, expect, it, vi } from 'vitest';

import { UsbConnection } from '../connections/usb-connection.js';
import { bold, Receipt, underline } from '../receipt.js';
import { writtenBytes } from './helpers/usb-mock.js';
import { VirtualPrinter } from './helpers/virtual-printer.js';

vi.mock('usb', async () => (await import('./helpers/usb-mock.js')).createUsbModule());

/** Print a receipt through the real USB connection and render what comes out */
async function printVirtual(receipt: Receipt, columns = 32): Promise<string> {
  writtenBytes.length = 0;
  const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, columns);
  await conn!.print(receipt);
  await conn!.close();
  return new VirtualPrinter(columns).write(writtenBytes).render();
}

describe('rule', () => {
  it('fills the paper width with a pattern', async () => {
    const receipt = new Receipt().rule().rule('=').rule('-=*');
    expect(await printVirtual(receipt, 20)).toMatchInlineSnapshot(`
      "┌────────────────────┐
      │--------------------│
      │====================│
      │-=*-=*-=*-=*-=*-=*-=│
      └────────────────────┘ (no cut)"
    `);
  });

  it('rejects an empty pattern', () => {
    expect(() => new Receipt().rule('')).toThrow('rule() pattern must not be empty');
  });
});

describe('pair', () => {
  it('puts content at both edges', async () => {
    const receipt = new Receipt()
      .pair('Subtotal', '$9.00')
      .pair('Tip', '$1.50', { fill: '.' })
      .pair(bold('Total'), bold('$10.50'));
    expect(await printVirtual(receipt, 24)).toMatchInlineSnapshot(`
      "┌────────────────────────┐
      │Subtotal           $9.00│
      │Tip .............. $1.50│
      │Total             $10.50│ bold "Total" · bold "$10.50"
      └────────────────────────┘ (no cut)"
    `);
  });

  it('moves the right side to its own line when both do not fit', async () => {
    const receipt = new Receipt()
      .pair('Extra large oat milk latte', '$6.50')
      .pair('A very long item name that wraps', '$1');
    expect(await printVirtual(receipt, 24)).toMatchInlineSnapshot(`
      "┌────────────────────────┐
      │Extra large oat milk    │
      │latte              $6.50│
      │A very long item name   │
      │that wraps            $1│
      └────────────────────────┘ (no cut)"
    `);
  });
});

describe('paragraph', () => {
  it('word-wraps to the paper width', async () => {
    const receipt = new Receipt().paragraph(
      'Thank you for shopping with us! Returns accepted within 30 days with a receipt.',
    );
    expect(await printVirtual(receipt, 24)).toMatchInlineSnapshot(`
      "┌────────────────────────┐
      │Thank you for shopping  │
      │with us! Returns        │
      │accepted within 30 days │
      │with a receipt.         │
      └────────────────────────┘ (no cut)"
    `);
  });

  it('keeps styles and alignment across wrapped lines', async () => {
    const receipt = new Receipt().paragraph(
      ['Visit ', bold('example.com/feedback'), ' to tell us how we did'],
      { align: 'center' },
    );
    expect(await printVirtual(receipt, 24)).toMatchInlineSnapshot(`
      "┌────────────────────────┐
      │          Visit         │
      │ example.com/feedback to│ bold "example.com/feedback"
      │   tell us how we did   │
      └────────────────────────┘ (no cut)"
    `);
  });

  it('breaks words longer than the line', async () => {
    const receipt = new Receipt().paragraph('Code: ABCDEFGHIJKLMNOPQRSTUVWXYZ0123');
    expect(await printVirtual(receipt, 16)).toMatchInlineSnapshot(`
      "┌────────────────┐
      │Code:           │
      │ABCDEFGHIJKLMNOP│
      │QRSTUVWXYZ0123  │
      └────────────────┘ (no cut)"
    `);
  });
});

describe('table', () => {
  it('lays out three columns with styled cells', async () => {
    const receipt = new Receipt().table({
      header: [bold('Item'), bold('Qty'), bold('Price')],
      rows: [
        ['Espresso', '2', '$8.00'],
        [underline('Croissant'), '1', '$3.50'],
        ['Tip', '', '$1.50'],
      ],
    });
    expect(await printVirtual(receipt)).toMatchInlineSnapshot(`
      "┌────────────────────────────────┐
      │Item                   Qty Price│ bold "Item" · bold "Qty" · bold "Price"
      │--------------------------------│
      │Espresso                 2 $8.00│
      │Croissant                1 $3.50│ underline "Croissant"
      │Tip                        $1.50│
      └────────────────────────────────┘ (no cut)"
    `);
  });

  it('wraps cells that do not fit their column', async () => {
    const receipt = new Receipt().table({
      header: ['Item', 'Price'],
      rows: [
        ['Large iced caramel macchiato with extra shot', '$7.25'],
        ['Water', '$0'],
      ],
    });
    expect(await printVirtual(receipt, 24)).toMatchInlineSnapshot(`
      "┌────────────────────────┐
      │Item               Price│
      │------------------------│
      │Large iced caramel $7.25│
      │macchiato with          │
      │extra shot              │
      │Water                 $0│
      └────────────────────────┘ (no cut)"
    `);
  });

  it('respects column alignment, fixed widths and divider options', async () => {
    const receipt = new Receipt().table({
      columns: [{ align: 'center', width: 6 }, { align: 'left' }, {}],
      header: ['#', 'Name', 'Pts'],
      rows: [
        ['1', 'Ada', '120'],
        ['22', 'Grace', '95'],
      ],
      divider: '=',
    });
    expect(await printVirtual(receipt, 24)).toMatchInlineSnapshot(`
      "┌────────────────────────┐
      │  #    Name          Pts│
      │========================│
      │  1    Ada           120│
      │  22   Grace          95│
      └────────────────────────┘ (no cut)"
    `);
  });

  it('prints without a header or divider', async () => {
    const receipt = new Receipt().table({
      rows: [
        ['Card', '**** 4242'],
        ['Auth', 'A1B2C3'],
      ],
      divider: false,
    });
    expect(await printVirtual(receipt, 24)).toMatchInlineSnapshot(`
      "┌────────────────────────┐
      │Card           **** 4242│
      │Auth              A1B2C3│
      └────────────────────────┘ (no cut)"
    `);
  });

  it('throws when fixed-width columns cannot fit the paper', async () => {
    const receipt = new Receipt().table({
      columns: [{ width: 20 }, { width: 20 }],
      rows: [['a', 'b']],
    });
    await expect(printVirtual(receipt, 32)).rejects.toThrow(
      'Table needs 41 characters but the paper is 32 wide',
    );
  });

  it('rejects invalid options', () => {
    expect(() => new Receipt().table({ columns: [{ width: 0 }], rows: [] })).toThrow(
      'table() column 0 width must be at least 1',
    );
    expect(() => new Receipt().table({ rows: [], divider: '' })).toThrow(
      'table() divider must not be empty',
    );
  });
});
