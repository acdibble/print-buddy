import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Receipt, bold, underline } from '../receipt.js';

vi.mock('usb', async () => (await import('./helpers/usb-mock.js')).createUsbModule());

// Import after mocking
import * as usb from 'usb';

import { UsbConnection } from '../connections/usb-connection.js';
import { PrinterNotFoundError, UnconfirmedPrintError } from '../errors.js';
import { getUsbProfile } from '../printer-model.js';
import { createUsbProfile } from '../printer-profile.js';
import { Printer } from '../printer.js';
import { mockPrinter, resetMockPrinter, writtenBytes } from './helpers/usb-mock.js';
import { VirtualPrinter } from './helpers/virtual-printer.js';

describe('UsbConnection', () => {
  beforeEach(() => {
    writtenBytes.length = 0;
  });

  it('throws PrinterNotFoundError when no device matches', async () => {
    vi.mocked(usb.findByIds).mockReturnValueOnce(undefined);

    const error = await new UsbConnection(0x04b8, 0x0e28).open().catch((err: unknown) => err);

    expect(error).toBeInstanceOf(PrinterNotFoundError);
    expect(error).toMatchObject({
      message: 'No USB printer found with vendor ID 0x04b8 and product ID 0x0e28',
      vendorId: 0x04b8,
      productId: 0x0e28,
    });
  });

  it('makes Printer.create throw when no device matches', async () => {
    vi.mocked(usb.findByIds).mockReturnValueOnce(undefined);

    await expect(Printer.create(getUsbProfile('TMT20III'))).rejects.toThrow(PrinterNotFoundError);
  });

  it('renders plain text', async () => {
    const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32);
    await conn.open();
    const receipt = new Receipt().line('Hello');

    await conn.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders bold text with ESC/POS commands', async () => {
    const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32);
    await conn.open();
    const receipt = new Receipt().line(bold('Bold'));

    await conn.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders underline text with ESC/POS commands', async () => {
    const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32);
    await conn.open();
    const receipt = new Receipt().line(underline('Underline'));

    await conn.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders nested bold and underline', async () => {
    const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32);
    await conn.open();
    const receipt = new Receipt().line(bold(underline('Both')));

    await conn.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders full cut command', async () => {
    const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32);
    await conn.open();
    const receipt = new Receipt().line('Test').cut();

    await conn.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders partial cut command', async () => {
    const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32);
    await conn.open();
    const receipt = new Receipt().line('Test').partialCut();

    await conn.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders feed command', async () => {
    const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32);
    await conn.open();
    const receipt = new Receipt().line('Test').feed();

    await conn.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders centered text', async () => {
    const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32);
    await conn.open();
    const receipt = new Receipt().line('Centered', { align: 'center' }).line('Left aligned');

    await conn.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders right aligned text', async () => {
    const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32);
    await conn.open();
    const receipt = new Receipt().line('Right', { align: 'right' }).line('Left');

    await conn.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders complete receipt', async () => {
    const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32);
    await conn.open();
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

    await conn.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });
});

describe('UsbConnection lifecycle', () => {
  beforeEach(() => {
    writtenBytes.length = 0;
  });

  it('throws PrinterNotFoundError from open when the printer was unplugged', async () => {
    vi.mocked(usb.findByIds).mockReturnValueOnce(undefined);

    await expect(new UsbConnection(0x04b8, 0x0e28).open()).rejects.toThrow(PrinterNotFoundError);
  });

  it('closes the device when claiming the interface fails', async () => {
    const device = usb.findByIds(0x04b8, 0x0e28)!;
    const close = vi.mocked(device.close);
    vi.mocked(device.interface).mockReturnValueOnce({
      isKernelDriverActive: () => false,
      claim: () => {
        throw new Error('busy');
      },
    } as unknown as usb.Interface);
    vi.mocked(usb.findByIds).mockReturnValueOnce(device);

    await expect(new UsbConnection(0x04b8, 0x0e28).open()).rejects.toThrow(
      'USB error: Failed to claim interface: Error: busy',
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('refuses to write before it was opened', async () => {
    const conn = new UsbConnection(0x04b8, 0x0e28);

    await expect(conn.print(new Receipt().line('x'))).rejects.toThrow('Connection not open');
  });

  it('does nothing when closed without being opened', async () => {
    await expect(new UsbConnection(0x04b8, 0x0e28).close()).resolves.toBeUndefined();
  });
});

describe('Printer with a USB profile', () => {
  beforeEach(() => {
    writtenBytes.length = 0;
    vi.mocked(usb.findByIds).mockClear();
  });

  it("checks for the printer on create but doesn't open it", async () => {
    await Printer.create(getUsbProfile('TMT20III'));

    expect(usb.findByIds).toHaveBeenCalledOnce();
    const device = vi.mocked(usb.findByIds).mock.results[0].value as usb.Device;
    expect(device.open).not.toHaveBeenCalled();
  });

  it("doesn't mix up concurrent jobs", async () => {
    const printer = await Printer.create(getUsbProfile('TMT20III', '58mm'));

    await Promise.all([
      printer.print(new Receipt().line(bold(['first ', underline('job')])).line('a')),
      printer.print(new Receipt().line(underline('second')).line('b')),
    ]);

    expect(new VirtualPrinter(35).write(writtenBytes).render()).toMatchInlineSnapshot(`
      "┌───────────────────────────────────┐
      │first job                          │ bold "first " · bold+underline "job"
      │a                                  │
      │second                             │ underline
      │b                                  │
      └───────────────────────────────────┘ (no cut)"
    `);
  });

  it('opens the device for each batch of jobs and closes it after', async () => {
    const printer = await Printer.create(getUsbProfile('TMT20III'));

    await Promise.all([printer.print(new Receipt()), printer.print(new Receipt())]);
    await printer.print(new Receipt());

    // One lookup from create, then one per batch
    const devices = vi.mocked(usb.findByIds).mock.results.map((r) => r.value as usb.Device);
    expect(devices).toHaveLength(3);
    for (const device of devices.slice(1)) {
      expect(device.open).toHaveBeenCalledOnce();
      expect(device.close).toHaveBeenCalledOnce();
    }
  });

  it('prints again once a printer that was unplugged is back', async () => {
    const printer = await Printer.create(getUsbProfile('TMT20III'));
    vi.mocked(usb.findByIds).mockReturnValueOnce(undefined);

    await expect(printer.print(new Receipt().line('x'))).rejects.toThrow(PrinterNotFoundError);
    await expect(printer.print(new Receipt().line('y'))).resolves.toBeUndefined();
  });
});

describe('UsbConnection job confirmation', () => {
  beforeEach(() => {
    writtenBytes.length = 0;
    resetMockPrinter();
    vi.mocked(usb.findByIds).mockClear();
  });

  const open = async (printTimeout?: number) => {
    const conn = new UsbConnection(0x04b8, 0x0e28, undefined, 2000, 32, printTimeout);
    await conn.open();
    const device = vi.mocked(usb.findByIds).mock.results.at(-1)?.value as usb.Device;
    const input = device.interface(0).endpoint(0x82) as usb.InEndpoint;
    return { conn, input };
  };

  const confirmation = (id: string) => Buffer.from([0x37, 0x22, ...Buffer.from(id), 0x00]);

  it('sends a process ID request after the job and waits for the echo', async () => {
    mockPrinter.confirm = false;
    const { conn, input } = await open();
    let done = false;

    const job = conn.print(new Receipt().line('Hello')).then(() => (done = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(done).toBe(false);
    expect(writtenBytes.slice(-11)).toEqual([
      0x1d, 0x28, 0x48, 6, 0, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30,
    ]);

    input.emit('data', Buffer.from([0x16, 0x14, 0x00, 0x00, 0x0f]));
    input.emit('data', confirmation('9999'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(done).toBe(false);

    input.emit('data', confirmation('0000').subarray(0, 3));
    input.emit('data', confirmation('0000').subarray(3));
    await job;
    expect(done).toBe(true);
  });

  it('uses a new process ID for every job', async () => {
    const { conn } = await open();

    await conn.print(new Receipt().line('one'));
    await conn.print(new Receipt().line('two'));

    const ids = writtenBytes
      .map((_, i) => writtenBytes.slice(i, i + 11))
      .filter((b) => b[0] === 0x1d && b[1] === 0x28 && b[2] === 0x48)
      .map((b) => String.fromCharCode(...b.slice(7)));
    expect(ids).toEqual(['0000', '0001']);
  });

  it('rejects with the offline cause when the job is not confirmed in time', async () => {
    mockPrinter.confirm = false;
    mockPrinter.offlineCause = 0x16;
    const { conn } = await open(30);

    const error = await conn.print(new Receipt().line('Hello')).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(UnconfirmedPrintError);
    expect(error).toMatchObject({
      message:
        "The printer didn't confirm the job within 30ms (cover open). It may still print once " +
        "the printer is ready, so don't send it again automatically.",
      status: { coverOpen: true, paperEnd: false, error: false },
    });
  });

  it('says so when the printer does not answer at all', async () => {
    mockPrinter.confirm = false;
    mockPrinter.offlineCause = null;
    const { conn } = await open(30);

    const error = await conn.print(new Receipt().line('Hello')).catch((err: unknown) => err);

    expect(error).toMatchObject({
      message: expect.stringContaining('within 30ms and it no longer answers') as unknown,
      status: null,
    });
  }, 3000);

  it('rejects when reading from the printer fails while waiting', async () => {
    mockPrinter.confirm = false;
    const { conn, input } = await open();

    const job = conn.print(new Receipt().line('Hello')).catch((err: unknown) => err);
    await new Promise((resolve) => setTimeout(resolve, 10));
    input.emit('error', new Error('LIBUSB_ERROR_NO_DEVICE'));
    const error = await job;

    expect(error).toBeInstanceOf(UnconfirmedPrintError);
    expect((error as Error).cause).toMatchObject({
      message: 'USB error: Reading from the printer failed: LIBUSB_ERROR_NO_DEVICE',
    });
  });

  it("doesn't wait for a confirmation when the printer has no IN endpoint", async () => {
    mockPrinter.inEndpoint = false;
    mockPrinter.confirm = false;
    const conn = new UsbConnection(0x04b8, 0x0e28);
    await conn.open();

    await conn.print(new Receipt().line('Hello'));

    expect(writtenBytes).not.toContain(0x28);
  });

  it('stops reading when closed', async () => {
    const { conn, input } = await open();

    await conn.close();

    expect(input.stopPoll).toHaveBeenCalledOnce();
    expect(input.listenerCount('data')).toBe(0);
  });

  it('surfaces through Printer with the timeout from the profile', async () => {
    mockPrinter.confirm = false;
    mockPrinter.offlineCause = 0x32;
    const printer = await Printer.create(
      createUsbProfile({
        vendorId: 0x04b8,
        productId: 0x0e28,
        printTimeout: 30,
        columnsPerFont: { FontA: 48, FontB: 64 },
      }),
    );

    await expect(printer.print(new Receipt().line('Hello'))).rejects.toMatchObject({
      name: 'UnconfirmedPrintError',
      status: { coverOpen: false, paperEnd: true, error: false },
    });
  });
});
