import { EventEmitter } from 'node:events';

import { vi } from 'vitest';

/** Every byte sent to the mocked USB endpoint, in order */
export const writtenBytes: number[] = [];

/**
 * How the mocked printer behaves. Tests change it; `resetMockPrinter` puts
 * the defaults back.
 */
export const mockPrinter = {
  /** Echo process ID requests (GS ( H), like a printer that printed the job */
  confirm: true,
  /** Reply to DLE EOT 2 (offline cause); 0x12 means no problem, null means no reply */
  offlineCause: 0x12 as number | null,
  /** Whether the device has a bulk IN endpoint at all */
  inEndpoint: true,
};

export function resetMockPrinter(): void {
  Object.assign(mockPrinter, { confirm: true, offlineCause: 0x12, inEndpoint: true });
}

/** The replies a TM-T20III sends for the status requests in `bytes` */
function replies(bytes: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x10 && bytes[i + 1] === 0x04 && bytes[i + 2] === 0x02) {
      if (mockPrinter.offlineCause !== null) out.push(mockPrinter.offlineCause);
    }
    if (
      mockPrinter.confirm &&
      bytes[i] === 0x1d &&
      bytes[i + 1] === 0x28 &&
      bytes[i + 2] === 0x48 &&
      bytes[i + 5] === 0x30
    ) {
      out.push(0x37, 0x22, ...bytes.subarray(i + 7, i + 11), 0x00);
    }
  }
  return out;
}

/**
 * Stand-in for the `usb` package that records bytes instead of sending them,
 * and answers status requests on the IN endpoint.
 *
 * @example
 * vi.mock('usb', async () => (await import('./helpers/usb-mock.js')).createUsbModule());
 */
export function createUsbModule() {
  class InEndpoint extends EventEmitter {
    direction = 'in';
    startPoll = vi.fn();
    stopPoll = vi.fn((callback?: () => void) => {
      callback?.();
    });
  }

  class OutEndpoint {
    direction = 'out';
    timeout = 0;

    constructor(private readonly input?: InEndpoint) {}

    transfer = vi.fn((buffer: Buffer, callback: (err: Error | null) => void) => {
      writtenBytes.push(...buffer);
      callback(null);
      const answer = replies(buffer);
      if (answer.length > 0 && this.input) {
        const input = this.input;
        setImmediate(() => input.emit('data', Buffer.from(answer)));
      }
    });
  }

  return {
    InEndpoint,
    OutEndpoint,
    findByIds: vi.fn(() => {
      const input = new InEndpoint();
      const output = new OutEndpoint(input);
      const endpoints = [{ direction: 'out', transferType: 2, address: 0x01 }];
      if (mockPrinter.inEndpoint)
        endpoints.push({ direction: 'in', transferType: 2, address: 0x82 });
      return {
        open: vi.fn(),
        close: vi.fn(),
        interface: vi.fn(() => ({
          isKernelDriverActive: vi.fn(() => false),
          claim: vi.fn(),
          release: vi.fn((_closeEndpoints: boolean, cb: () => void) => {
            cb();
          }),
          endpoint: vi.fn((address: number) => (address === 0x82 ? input : output)),
          endpoints,
        })),
      };
    }),
  };
}
