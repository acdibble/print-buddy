import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsoleConnection } from '../connections/console-connection.js';
import { bold, Receipt, underline } from '../receipt.js';

/** Print a receipt to the console connection and capture what it writes */
async function printConsole(receipt: Receipt, width = 20): Promise<string> {
  let output = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    output += String(chunk);
    return true;
  });
  await new ConsoleConnection(width).print(receipt);
  vi.restoreAllMocks();
  // Make ANSI codes readable in snapshots
  return output
    .replaceAll('\x1b[0m', '<reset>')
    .replaceAll('\x1b[1m', '<bold>')
    .replaceAll('\x1b[4m', '<underline>')
    .replaceAll('\x1b[2m', '<dim>');
}

describe('ConsoleConnection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aligns lines with padding', async () => {
    const receipt = new Receipt()
      .line('left')
      .line('center', { align: 'center' })
      .line('right', { align: 'right' });

    expect(await printConsole(receipt)).toMatchInlineSnapshot(`
      "<reset>left
             center
                     right
      <reset>"
    `);
  });

  it('keeps an outer style after a nested one ends', async () => {
    const receipt = new Receipt()
      .line(underline(['a', bold('b'), 'c']))
      .line(['Total: ', bold('$5.50')], { align: 'right' });

    expect(await printConsole(receipt)).toMatchInlineSnapshot(`
      "<reset><underline>a<bold>b<reset><underline>c<reset>
              Total: <bold>$5.50<reset>
      <reset>"
    `);
  });
});
