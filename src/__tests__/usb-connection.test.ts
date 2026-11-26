import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Receipt, bold, underline } from '../receipt.js';

vi.mock('usb', async () => (await import('./helpers/usb-mock.js')).createUsbModule());

// Import after mocking
import { UsbConnection } from '../connections/usb-connection.js';
import { writtenBytes } from './helpers/usb-mock.js';

describe('UsbConnection', () => {
  beforeEach(() => {
    writtenBytes.length = 0;
  });

  it('renders plain text', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line('Hello');

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders bold text with ESC/POS commands', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line(bold('Bold'));

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders underline text with ESC/POS commands', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line(underline('Underline'));

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders nested bold and underline', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line(bold(underline('Both')));

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders full cut command', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line('Test').cut();

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders partial cut command', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line('Test').partialCut();

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders feed command', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line('Test').feed();

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders centered text', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line('Centered', { align: 'center' }).line('Left aligned');

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders right aligned text', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line('Right', { align: 'right' }).line('Left');

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders complete receipt', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt()
      .line(bold('STORE NAME'))
      .line('123 Main St')
      .blank()
      .line(underline('Order #123'))
      .blank()
      .table({
        header: ['Item', 'Price'],
        rows: [
          ['Coffee', '$3.50'],
          ['Muffin', '$2.00'],
        ],
      })
      .blank()
      .line(bold(underline('Total: $5.50')))
      .cut();

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });
});
