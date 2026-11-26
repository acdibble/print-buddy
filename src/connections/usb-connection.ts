import iconv from 'iconv-lite';
import * as usb from 'usb';

import {
  ALIGN_CENTER,
  ALIGN_LEFT,
  ALIGN_RIGHT,
  BOLD_OFF,
  BOLD_ON,
  CUT,
  FEED,
  FLIP_OFF,
  FLIP_ON,
  FONT_A,
  FONT_B,
  PARTIAL_CUT,
  RESET,
  UNDERLINE_1DOT,
  UNDERLINE_2DOT,
  UNDERLINE_OFF,
} from '../command.js';
import { NoBulkEndpointError, UsbError } from '../errors.js';
import { BlankNode, CutNode, FeedNode, LineNode, PartialCutNode, TextNode } from '../receipt.js';
import { PrinterConnection, TextStyle } from './printer-connection.js';

const ALIGN = { left: ALIGN_LEFT, center: ALIGN_CENTER, right: ALIGN_RIGHT } as const;
const UNDERLINE = { none: UNDERLINE_OFF, normal: UNDERLINE_1DOT, thick: UNDERLINE_2DOT } as const;

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

  private encode(text: string): Uint8Array {
    return iconv.encode(text, 'cp437');
  }

  protected async visitText(node: TextNode): Promise<void> {
    await this.write(this.encode(node.value));
  }

  protected async applyStyle(next: TextStyle, previous: TextStyle): Promise<void> {
    if (next.bold !== previous.bold) await this.write(next.bold ? BOLD_ON : BOLD_OFF);
    if (next.underline !== previous.underline) await this.write(UNDERLINE[next.underline]);
    if (next.fontB !== previous.fontB) await this.write(next.fontB ? FONT_B : FONT_A);
  }

  protected async visitLine(node: LineNode): Promise<void> {
    // Alignment and upside-down mode apply to the whole line when it prints,
    // so set them first and restore the defaults after the line feed.
    if (node.align !== 'left') await this.write(ALIGN[node.align]);
    if (node.flip) await this.write(FLIP_ON);

    await this.visit(node.child);
    await this.write(this.encode('\n'));

    if (node.flip) await this.write(FLIP_OFF);
    if (node.align !== 'left') await this.write(ALIGN_LEFT);
  }

  protected async visitBlank(node: BlankNode): Promise<void> {
    await this.write(this.encode('\n'.repeat(node.count)));
  }

  protected async visitFeed(_node: FeedNode): Promise<void> {
    await this.write(FEED);
  }

  protected async visitCut(_node: CutNode): Promise<void> {
    await this.write(CUT);
  }

  protected async visitPartialCut(_node: PartialCutNode): Promise<void> {
    await this.write(PARTIAL_CUT);
  }

  protected async reset(): Promise<void> {
    await this.write(RESET);
    await this.write(ALIGN_LEFT);
  }

  private async write(data: Uint8Array): Promise<void> {
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
