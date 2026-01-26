import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Receipt, text, bold, underline } from '../receipt';

// Capture all bytes written to the mock endpoint
let writtenBytes: number[] = [];

// Mock the usb package
vi.mock('usb', () => {
  return {
    findByIds: vi.fn(() => ({
      open: vi.fn(),
      close: vi.fn(),
      interface: vi.fn(() => ({
        isKernelDriverActive: vi.fn(() => false),
        claim: vi.fn(),
        release: vi.fn(),
        endpoint: vi.fn(() => ({
          direction: 'out',
          timeout: 0,
          transfer: vi.fn((buffer: Buffer, callback: (err: Error | null) => void) => {
            writtenBytes.push(...buffer);
            callback(null);
          }),
        })),
        endpoints: [{ direction: 'out', transferType: 2, address: 1 }],
      })),
    })),
  };
});

// Import after mocking
import { UsbConnection } from '../connections/usb-connection';

describe('UsbConnection', () => {
  beforeEach(() => {
    writtenBytes = [];
  });

  it('renders plain text', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line(text('Hello'));

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders bold text with ESC/POS commands', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line(bold(text('Bold')));

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders underline text with ESC/POS commands', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line(underline(text('Underline')));

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders nested bold and underline', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line(bold(underline(text('Both'))));

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders full cut command', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line(text('Test')).cut();

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders partial cut command', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line(text('Test')).partialCut();

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders feed command', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt().line(text('Test')).feed();

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });

  it('renders complete receipt', async () => {
    const conn = await UsbConnection.open(0x04b8, 0x0e28, undefined, 2000, 32);
    const receipt = new Receipt()
      .line(bold(text('STORE NAME')))
      .line(text('123 Main St'))
      .blank()
      .line(underline(text('Order #123')))
      .blank()
      .table(['Item', 'Price'], [['Coffee', '$3.50'], ['Muffin', '$2.00']])
      .blank()
      .line(bold(underline(text('Total: $5.50'))))
      .cut();

    await conn!.print(receipt);

    expect(writtenBytes).toMatchSnapshot();
  });
});
