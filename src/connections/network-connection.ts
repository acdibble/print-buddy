import { once } from 'node:events';
import { connect, Socket } from 'node:net';

import { NetworkError } from '../errors.js';
import { Receipt } from '../receipt.js';
import { EscPosConnection } from './escpos-connection.js';

/**
 * Network connection for thermal printers (raw TCP, usually port 9100)
 *
 * `open` connects and `close` disconnects; `Printer` keeps one socket for as
 * long as it has jobs queued, so a long-running process doesn't hold the
 * printer between batches. Each job is collected in memory and sent in one
 * write. If the socket fails or the printer closes it, the next job
 * connects again.
 */
export class NetworkConnection extends EscPosConnection {
  private chunks: Uint8Array[] = [];
  private socket: Socket | null = null;

  /**
   * @param host Printer (or print server) hostname or IP address
   * @param port TCP port (default: 9100)
   * @param timeout Milliseconds the socket may sit idle before it is dropped, failing a job that is connecting or sending (default: 5000)
   * @param width Printer column width (default: 32)
   * @param printTimeout Milliseconds to wait for the printer to confirm a job (default: 60000)
   */
  constructor(
    private readonly host: string,
    private readonly port: number = 9100,
    private readonly timeout: number = 5000,
    width: number = 32,
    printTimeout?: number,
  ) {
    super(width, printTimeout);
  }

  private get address(): string {
    return `${this.host}:${String(this.port)}`;
  }

  protected async connect(): Promise<void> {
    this.replaceSocket(await this.createSocket());
  }

  async print(receipt: Receipt): Promise<void> {
    this.chunks = [];
    try {
      await super.print(receipt);
    } finally {
      this.chunks = [];
    }
  }

  protected async write(data: Uint8Array): Promise<void> {
    this.chunks.push(data);
  }

  protected async flush(): Promise<void> {
    const data = Buffer.concat(this.chunks);
    this.chunks = [];
    await this.send(data);
  }

  private replaceSocket(socket: Socket | null): void {
    const old = this.socket;
    this.socket = socket;
    old?.destroy();
  }

  private async createSocket(): Promise<Socket> {
    const socket = connect({ host: this.host, port: this.port });
    socket.on('error', () => {});
    socket.on('data', (data: Buffer) => {
      this.receive(data);
    });
    socket.on('close', () => {
      if (this.socket === socket) {
        this.connectionLost(new NetworkError(`${this.address} closed the connection`));
      }
    });
    socket.setTimeout(this.timeout, () => {
      if (this.socket === socket && this.waitingForPrinter) return;
      socket.destroy(new NetworkError(`Timed out waiting for ${this.address}`));
    });

    try {
      await once(socket, 'connect');
    } catch (err) {
      socket.destroy();
      throw this.networkError('connect to', err);
    }
    return socket;
  }

  private async send(data: Buffer): Promise<void> {
    let socket = this.socket;
    if (!socket?.writable) {
      this.replaceSocket(null);
      socket = await this.createSocket();
      this.replaceSocket(socket);
    }

    const { promise, resolve, reject } = Promise.withResolvers<void>();
    socket.write(data, (err) => {
      if (err) reject(this.networkError('print to', err));
      else resolve();
    });
    await promise;
  }

  private networkError(action: string, err: unknown): NetworkError {
    if (err instanceof NetworkError) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new NetworkError(`Failed to ${action} ${this.address}: ${message}`);
  }

  /**
   * End the socket and wait for it to close. Never throws.
   */
  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    if (!socket || socket.destroyed) return;

    socket.end();
    await once(socket, 'close').catch(() => {});
  }
}
