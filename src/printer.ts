import {
  ConsoleConnection,
  NetworkConnection,
  PrinterConnection,
  UsbConnection,
} from './connections/index.js';
import { EscposError } from './errors.js';
import { PrinterProfile } from './printer-profile.js';
import { Receipt } from './receipt.js';

/**
 * Main printer class
 *
 * The Printer represents a thermal printer connected to the computer.
 * It delegates receipt printing to the underlying connection.
 *
 * Jobs print one at a time, in the order `print` was called. The connection
 * is opened for the first job in the queue and closed once the queue is
 * empty, so the printer isn't held between batches. A failed job also closes
 * it, and the next job opens a fresh connection.
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
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private connected = false;
  private closed = false;

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
        const { vendorId, productId, endpoint, timeout, printTimeout } = profile.connectionData;
        const usb = new UsbConnection(
          vendorId,
          productId,
          endpoint,
          timeout,
          fontAWidth,
          printTimeout,
        );
        usb.findDevice();
        connection = usb;
        break;
      }

      case 'network': {
        const { host, port, timeout, printTimeout } = profile.connectionData;
        connection = new NetworkConnection(host, port, timeout, fontAWidth, printTimeout);
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
   * Print a receipt once the jobs before it are done. On USB and network
   * printers it resolves when the printer confirms the job has printed.
   *
   * @throws {EscposError} If the printer was closed
   * @throws {UnconfirmedPrintError} If the printer didn't confirm the job
   *   within the profile's `printTimeout`. The job may still print.
   */
  async print(receipt: Receipt): Promise<void> {
    if (this.closed) throw new EscposError('Printer is closed');
    this.pending++;
    const job = this.queue.then(() => this.runJob(receipt));
    this.queue = job.catch(() => {});
    await job;
  }

  private async runJob(receipt: Receipt): Promise<void> {
    let failed = true;
    try {
      if (!this.connected) {
        await this.connection.open();
        this.connected = true;
      }
      await this.connection.print(receipt);
      failed = false;
    } finally {
      this.pending--;
      if (failed || this.pending === 0) await this.disconnect();
    }
  }

  private async disconnect(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
    await this.connection.close().catch(() => {});
  }

  /**
   * Stop accepting jobs and wait for the queued ones to finish. The
   * connection closes when the last one is done. Calling it again does
   * nothing.
   */
  async close(): Promise<void> {
    this.closed = true;
    await this.queue;
  }

  /**
   * Close the printer at the end of an `await using` block
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}
