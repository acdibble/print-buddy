import * as usb from 'usb';

import { NoBulkEndpointError, PrinterNotFoundError, UsbError } from '../errors.js';
import { EscPosConnection } from './escpos-connection.js';

// libusb transfer type constant for bulk transfers
const LIBUSB_TRANSFER_TYPE_BULK = 2;

/**
 * USB connection for thermal printers
 *
 * Uses the `usb` package for native USB communication. `open` looks the
 * device up again every time, so a printer that was unplugged and plugged
 * back in works on the next job. Replies are read from the bulk IN endpoint;
 * without one, jobs aren't confirmed.
 */
export class UsbConnection extends EscPosConnection {
  private device: usb.Device | null = null;
  private interface: usb.Interface | null = null;
  private endpoint: usb.OutEndpoint | null = null;
  private input: usb.InEndpoint | null = null;

  /**
   * @param vendorId USB vendor ID
   * @param productId USB product ID
   * @param endpointAddress Optional endpoint address (auto-detected if not provided)
   * @param timeout Timeout in milliseconds (default: 2000)
   * @param width Printer column width (default: 32)
   * @param printTimeout Milliseconds to wait for the printer to confirm a job (default: 60000)
   */
  constructor(
    private readonly vendorId: number,
    private readonly productId: number,
    private readonly endpointAddress?: number,
    private readonly timeout: number = 2000,
    width: number = 32,
    printTimeout?: number,
  ) {
    super(width, printTimeout);
  }

  /**
   * Find the printer without opening it
   *
   * @throws {PrinterNotFoundError} If no device matches the vendor and product IDs
   */
  findDevice(): usb.Device {
    const device = usb.findByIds(this.vendorId, this.productId);
    if (!device) {
      throw new PrinterNotFoundError(this.vendorId, this.productId);
    }
    return device;
  }

  /**
   * Open the device, claim its interface and start reading replies
   *
   * @throws {PrinterNotFoundError} If no device matches the vendor and product IDs
   */
  protected async connect(): Promise<void> {
    const device = this.findDevice();
    try {
      device.open();
    } catch (err) {
      throw new UsbError(`Failed to open device: ${String(err)}`);
    }
    this.device = device;

    try {
      this.claim();
    } catch (err) {
      // Don't leave the device half open
      await this.close();
      throw err;
    }
  }

  private claim(): void {
    if (!this.device) throw new UsbError('Connection not open');

    // Find and claim interface 0
    const iface = this.device.interface(0);

    // Check if kernel driver is active and detach if needed
    if (iface.isKernelDriverActive()) {
      try {
        iface.detachKernelDriver();
      } catch {
        // Ignore errors, some platforms don't support this
      }
    }

    try {
      iface.claim();
    } catch (err) {
      throw new UsbError(`Failed to claim interface: ${String(err)}`);
    }
    this.interface = iface;

    // Find bulk OUT endpoint
    const address = this.endpointAddress ?? this.findBulkOutEndpoint();
    if (address === null) {
      throw new NoBulkEndpointError();
    }

    // Get the endpoint object
    const ep = iface.endpoint(address);
    if (!(ep instanceof usb.OutEndpoint)) {
      throw new UsbError(`Endpoint ${String(address)} is not a valid OUT endpoint`);
    }
    this.endpoint = ep;

    const input = this.findBulkInEndpoint();
    this.input = input;
    this.canReceive = input !== null;
    if (input) {
      input.on('data', (data: Buffer) => {
        if (data.length > 0) this.receive(data);
      });
      input.on('error', (err: Error) => {
        this.connectionLost(new UsbError(`Reading from the printer failed: ${err.message}`));
      });
      input.startPoll(1, 64);
    }
  }

  private findBulkInEndpoint(): usb.InEndpoint | null {
    if (!this.interface) return null;
    for (const ep of this.interface.endpoints) {
      if (ep.direction === 'in' && ep.transferType === LIBUSB_TRANSFER_TYPE_BULK) {
        const endpoint = this.interface.endpoint(ep.address);
        if (endpoint instanceof usb.InEndpoint) return endpoint;
      }
    }
    return null;
  }

  /**
   * Find a bulk OUT endpoint
   */
  private findBulkOutEndpoint(): number | null {
    if (!this.interface) return null;

    for (const ep of this.interface.endpoints) {
      if (ep.direction === 'out' && ep.transferType === LIBUSB_TRANSFER_TYPE_BULK) {
        return ep.address;
      }
    }
    return null;
  }

  protected async write(data: Uint8Array): Promise<void> {
    if (!this.endpoint) {
      throw new UsbError('Connection not open');
    }

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const buffer = Buffer.from(data);
    this.endpoint.timeout = this.timeout;
    this.endpoint.transfer(buffer, (err) => {
      if (err) {
        reject(new UsbError(`Transfer failed: ${err.message}`));
      } else {
        resolve(undefined);
      }
    });
    return promise;
  }

  /**
   * Release the interface and close the device. Never throws.
   */
  async close(): Promise<void> {
    const { device, interface: iface, input } = this;
    this.device = null;
    this.interface = null;
    this.endpoint = null;
    this.input = null;

    if (input) {
      await new Promise<void>((resolve) => {
        try {
          input.stopPoll(() => {
            resolve();
          });
        } catch {
          resolve();
        }
      });
      input.removeAllListeners();
    }

    if (iface) {
      await new Promise<void>((resolve) => {
        try {
          // Release errors are ignored: the device is closed either way
          iface.release(true, () => {
            resolve();
          });
        } catch {
          resolve();
        }
      });
    }

    try {
      device?.close();
    } catch {
      // Ignore close errors
    }
  }
}
