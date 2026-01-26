import * as usb from 'usb';
import * as iconv from 'iconv-lite';
import { PrinterConnection } from './printer-connection';
import { Node } from '../receipt';
import { BOLD_ON, BOLD_OFF, UNDERLINE_1DOT, UNDERLINE_OFF, FEED, CUT, PARTIAL_CUT, ALIGN_LEFT, ALIGN_CENTER, ALIGN_RIGHT } from '../command';
import { NoBulkEndpointError, UsbError } from '../errors';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// libusb transfer type constant for bulk transfers
const LIBUSB_TRANSFER_TYPE_BULK = 2;

/**
 * USB connection for thermal printers
 *
 * Uses the `usb` package for native USB communication.
 */
export class UsbConnection extends PrinterConnection {
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
   */
  static async open(
    vendorId: number,
    productId: number,
    endpointAddress?: number,
    timeout: number = 2000,
    width: number = 32,
  ): Promise<UsbConnection | null> {
    const device = usb.findByIds(vendorId, productId);
    if (!device) {
      return null;
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
      throw new UsbError(`Failed to open device: ${err}`);
    }

    // Find and claim interface 0
    this.interface = this.device.interface(0);
    if (!this.interface) {
      throw new UsbError('Interface 0 not found');
    }

    // Check if kernel driver is active and detach if needed
    if (this.interface.isKernelDriverActive()) {
      try {
        this.interface.detachKernelDriver();
      } catch (err) {
        // Ignore errors, some platforms don't support this
      }
    }

    try {
      this.interface.claim();
    } catch (err) {
      throw new UsbError(`Failed to claim interface: ${err}`);
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
    if (!ep || ep.direction !== 'out') {
      throw new UsbError(`Endpoint ${actualEndpoint} is not a valid OUT endpoint`);
    }
    this.endpoint = ep as usb.OutEndpoint;
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

  private encode(text: string): Uint8Array {
    return new Uint8Array(iconv.encode(text, 'cp437'));
  }

  protected async visitText(value: string): Promise<void> {
    await this.write(this.encode(value));
  }

  protected async visitBold(child: Node): Promise<void> {
    await this.write(BOLD_ON);
    await this.visit(child);
    await this.write(BOLD_OFF);
  }

  protected async visitUnderline(child: Node): Promise<void> {
    await this.write(UNDERLINE_1DOT);
    await this.visit(child);
    await this.write(UNDERLINE_OFF);
  }

  protected async visitLeft(child: Node): Promise<void> {
    await this.write(ALIGN_LEFT);
    await this.visit(child);
    await this.write(ALIGN_LEFT);
  }

  protected async visitCenter(child: Node): Promise<void> {
    await this.write(ALIGN_CENTER);
    await this.visit(child);
    await this.write(ALIGN_LEFT);
  }

  protected async visitRight(child: Node): Promise<void> {
    await this.write(ALIGN_RIGHT);
    await this.visit(child);
    await this.write(ALIGN_LEFT);
  }

  protected async visitLine(child: Node): Promise<void> {
    await this.visit(child);
    await this.write(this.encode('\n'));
  }

  protected async visitBlank(count: number): Promise<void> {
    await this.write(this.encode('\n'.repeat(count)));
  }

  protected async visitTable(headers: [string, string], rows: [string, string][]): Promise<void> {
    const output = this.formatter.duoTable(headers, rows);
    await this.write(this.encode(output));
  }

  protected async visitFeed(): Promise<void> {
    await this.write(FEED);
  }

  protected async visitCut(): Promise<void> {
    await this.write(CUT);
  }

  protected async visitPartialCut(): Promise<void> {
    await this.write(PARTIAL_CUT);
  }

  private async write(data: Uint8Array): Promise<void> {
    if (!this.endpoint) {
      throw new UsbError('Connection not initialized');
    }

    const { promise, resolve, reject } = deferred<void>();
    const buffer = Buffer.from(data);
    this.endpoint.timeout = this.timeout;
    this.endpoint.transfer(buffer, (err) => {
      if (err) {
        reject(new UsbError(`Transfer failed: ${err.message}`));
      } else {
        resolve();
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
        iface.release(true, (err) => {
          // Ignore release errors, resolve regardless
          resolve();
        });
      });
    }

    try {
      this.device.close();
    } catch (err) {
      // Ignore close errors
    }
  }
}
