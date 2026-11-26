import * as usb from 'usb';

import { NoBulkEndpointError, PrinterNotFoundError, UsbError } from '../errors.js';
import { EscPosConnection } from './escpos-connection.js';

// libusb transfer type constant for bulk transfers
const LIBUSB_TRANSFER_TYPE_BULK = 2;

/**
 * USB connection for thermal printers
 *
 * Uses the `usb` package for native USB communication.
 */
export class UsbConnection extends EscPosConnection {
  private device: usb.Device;
  private interface: usb.Interface | null = null;
  private endpoint: usb.OutEndpoint | null = null;
  private timeout: number;

  private constructor(device: usb.Device, timeout: number, width: number) {
    super(width);
    this.device = device;
    this.timeout = timeout;
  }

  /**
   * Open a USB connection to a printer
   *
   * @param vendorId USB vendor ID
   * @param productId USB product ID
   * @param endpointAddress Optional endpoint address (auto-detected if not provided)
   * @param timeout Timeout in milliseconds (default: 2000)
   * @param width Printer column width (default: 32)
   * @throws {PrinterNotFoundError} If no device matches the vendor and product IDs
   */
  static async open(
    vendorId: number,
    productId: number,
    endpointAddress?: number,
    timeout: number = 2000,
    width: number = 32,
  ): Promise<UsbConnection> {
    const device = usb.findByIds(vendorId, productId);
    if (!device) {
      throw new PrinterNotFoundError(vendorId, productId);
    }

    const connection = new UsbConnection(device, timeout, width);
    await connection.initialize(endpointAddress);
    return connection;
  }

  /**
   * Initialize the USB connection
   */
  private async initialize(endpointAddress?: number): Promise<void> {
    try {
      this.device.open();
    } catch (err) {
      throw new UsbError(`Failed to open device: ${String(err)}`);
    }

    // Find and claim interface 0
    this.interface = this.device.interface(0);

    // Check if kernel driver is active and detach if needed
    if (this.interface.isKernelDriverActive()) {
      try {
        this.interface.detachKernelDriver();
      } catch {
        // Ignore errors, some platforms don't support this
      }
    }

    try {
      this.interface.claim();
    } catch (err) {
      throw new UsbError(`Failed to claim interface: ${String(err)}`);
    }

    // Find bulk OUT endpoint
    let actualEndpoint: number;
    if (endpointAddress !== undefined) {
      actualEndpoint = endpointAddress;
    } else {
      const foundEndpoint = this.findBulkOutEndpoint();
      if (foundEndpoint === null) {
        throw new NoBulkEndpointError();
      }
      actualEndpoint = foundEndpoint;
    }

    // Get the endpoint object
    const ep = this.interface.endpoint(actualEndpoint);
    if (!(ep instanceof usb.OutEndpoint)) {
      throw new UsbError(`Endpoint ${String(actualEndpoint)} is not a valid OUT endpoint`);
    }
    this.endpoint = ep;
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
      throw new UsbError('Connection not initialized');
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
   * Close the USB connection
   */
  async close(): Promise<void> {
    if (this.interface) {
      const iface = this.interface;
      this.interface = null;
      this.endpoint = null;

      await new Promise<void>((resolve) => {
        iface.release(true, () => {
          resolve();
        });
      });
    }

    try {
      this.device.close();
    } catch {
      // Ignore close errors
    }
  }
}
