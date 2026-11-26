import { connect } from 'node:net';

import { NetworkError } from '../errors.js';
import { Receipt } from '../receipt.js';
import { EscPosConnection } from './escpos-connection.js';

/**
 * Network connection for thermal printers (raw TCP, usually port 9100)
 *
 * Each print job opens its own socket, sends the whole job and closes the
 * socket, so a long-running process doesn't hold the printer between jobs
 * and a printer that was offline works again on the next job. Jobs on the
 * same connection are sent one at a time.
 */
export class NetworkConnection extends EscPosConnection {
  private chunks: Uint8Array[] = [];
  private queue: Promise<void> = Promise.resolve();

  /**
   * @param host Printer (or print server) hostname or IP address
   * @param port TCP port (default: 9100)
   * @param timeout Milliseconds the socket may sit idle before the job fails (default: 5000)
   * @param width Printer column width (default: 32)
   */
  constructor(
    private readonly host: string,
    private readonly port: number = 9100,
    private readonly timeout: number = 5000,
    width: number = 32,
  ) {
    super(width);
  }

  async print(receipt: Receipt): Promise<void> {
    const job = this.queue.then(() => this.printJob(receipt));
    // Keep the queue going after a failed job; the caller still sees the error
    this.queue = job.catch(() => {});
    return job;
  }

  private async printJob(receipt: Receipt): Promise<void> {
    this.chunks = [];
    try {
      await super.print(receipt);
      await this.send(Buffer.concat(this.chunks));
    } finally {
      this.chunks = [];
    }
  }

  protected async write(data: Uint8Array): Promise<void> {
    this.chunks.push(data);
  }

  private send(data: Buffer): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const address = `${this.host}:${String(this.port)}`;
    let flushed = false;

    const socket = connect({ host: this.host, port: this.port });
    socket.setTimeout(this.timeout);

    socket.on('connect', () => {
      socket.end(data, () => {
        flushed = true;
      });
    });

    // The printer may report status bytes; read and discard them so the
    // socket closes cleanly
    socket.resume();

    socket.on('timeout', () => {
      if (flushed) {
        // Everything was sent; the other end just hasn't closed its side
        socket.destroy();
      } else {
        socket.destroy(new NetworkError(`Timed out sending to ${address}`));
      }
    });

    socket.on('error', (err) => {
      reject(
        err instanceof NetworkError
          ? err
          : new NetworkError(`Failed to print to ${address}: ${err.message}`),
      );
    });

    socket.on('close', (hadError) => {
      if (hadError) return; // 'error' already rejected
      if (flushed) resolve();
      else reject(new NetworkError(`${address} closed the connection before the job was sent`));
    });

    return promise;
  }

  /**
   * Wait for queued jobs to finish (sockets are closed after every job)
   */
  async close(): Promise<void> {
    await this.queue;
  }
}
