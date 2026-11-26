import {
  ConsoleConnection,
  NetworkConnection,
  PrinterConnection,
  UsbConnection,
} from './connections/index.js';
import { PrinterProfile } from './printer-profile.js';
import { Receipt } from './receipt.js';

/**
 * Main printer class
 *
 * The Printer represents a thermal printer connected to the computer.
 * It delegates receipt printing to the underlying connection.
 *
 * Printers are async disposable: `await using` closes the printer when the
 * enclosing block exits, even if printing throws.
 *
 * @example
 * await using printer = await Printer.create(createConsoleProfile());
 *
 * const receipt = new Receipt()
 *   .line(bold('Hello World!'))
 *   .cut();
 * await printer.print(receipt);
 */
export class Printer implements AsyncDisposable {
  private connection: PrinterConnection;
  private closing: Promise<void> | null = null;

  private constructor(connection: PrinterConnection) {
    this.connection = connection;
  }

  /**
   * Create a new printer with the given profile
   *
   * @throws {PrinterNotFoundError} If no USB device matches the profile's
   *   vendor and product IDs. Network profiles don't connect until a job prints.
   */
  static async create(profile: PrinterProfile): Promise<Printer> {
    const fontAWidth = profile.columnsPerFont.FontA;

    let connection: PrinterConnection;

    switch (profile.connectionData.type) {
      case 'usb': {
        const { vendorId, productId, endpoint, timeout } = profile.connectionData;
        connection = await UsbConnection.open(vendorId, productId, endpoint, timeout, fontAWidth);
        break;
      }

      case 'network': {
        const { host, port, timeout } = profile.connectionData;
        connection = new NetworkConnection(host, port, timeout, fontAWidth);
        break;
      }

      case 'console': {
        connection = new ConsoleConnection(fontAWidth);
        break;
      }
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
   * Close the printer connection. Calling it again does nothing.
   */
  async close(): Promise<void> {
    this.closing ??= this.connection.close();
    await this.closing;
  }

  /**
   * Close the printer at the end of an `await using` block
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}
