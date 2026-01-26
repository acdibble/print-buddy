import { PrinterConnection, UsbConnection, ConsoleConnection } from './connections/index.js';
import { PrinterProfile } from './printer-profile.js';
import { NoFontFoundError } from './errors.js';
import { Receipt } from './receipt.js';

/**
 * Main printer class
 *
 * The Printer represents a thermal printer connected to the computer.
 * It delegates receipt printing to the underlying connection.
 *
 * @example
 * const printer = await Printer.create(createConsoleProfile());
 *
 * const receipt = new Receipt()
 *   .line(bold(text("Hello World!")))
 *   .cut();
 * await printer.print(receipt);
 */
export class Printer {
  private connection: PrinterConnection;

  private constructor(connection: PrinterConnection) {
    this.connection = connection;
  }

  /**
   * Create a new printer with the given profile
   *
   * @returns The printer instance, or null if the device was not found (USB only)
   */
  static async create(profile: PrinterProfile): Promise<Printer | null> {
    const fontAWidth = profile.columnsPerFont.get('FontA');
    if (fontAWidth === undefined) {
      throw new NoFontFoundError();
    }

    let connection: PrinterConnection;

    switch (profile.connectionData.type) {
      case 'usb': {
        const { vendorId, productId, endpoint, timeout } = profile.connectionData;
        const usbConn = await UsbConnection.open(vendorId, productId, endpoint, timeout, fontAWidth);
        if (!usbConn) {
          return null;
        }
        connection = usbConn;
        break;
      }

      case 'console': {
        connection = new ConsoleConnection(fontAWidth);
        break;
      }

      case 'network':
        throw new Error('Network connection not implemented');
    }

    return new Printer(connection);
  }

  /**
   * Print a receipt
   */
  async print(receipt: Receipt): Promise<void> {
    await this.connection.print(receipt);
  }

  /**
   * Close the printer connection
   */
  async close(): Promise<void> {
    await this.connection.close();
  }
}
