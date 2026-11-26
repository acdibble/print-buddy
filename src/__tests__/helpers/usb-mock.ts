import { vi } from 'vitest';

/** Every byte sent to the mocked USB endpoint, in order */
export const writtenBytes: number[] = [];

/**
 * Stand-in for the `usb` package that records bytes instead of sending them.
 *
 * @example
 * vi.mock('usb', async () => (await import('./helpers/usb-mock.js')).createUsbModule());
 */
export function createUsbModule() {
  class OutEndpoint {
    direction = 'out';
    timeout = 0;
    transfer = vi.fn((buffer: Buffer, callback: (err: Error | null) => void) => {
      writtenBytes.push(...buffer);
      callback(null);
    });
  }

  return {
    OutEndpoint,
    findByIds: vi.fn(() => ({
      open: vi.fn(),
      close: vi.fn(),
      interface: vi.fn(() => ({
        isKernelDriverActive: vi.fn(() => false),
        claim: vi.fn(),
        release: vi.fn((_closeEndpoints: boolean, cb: () => void) => {
          cb();
        }),
        endpoint: vi.fn(() => new OutEndpoint()),
        endpoints: [{ direction: 'out', transferType: 2, address: 1 }],
      })),
    })),
  };
}
