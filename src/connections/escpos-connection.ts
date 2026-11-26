import iconv from 'iconv-lite';

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
  OFFLINE_CAUSE_REQUEST,
  PARTIAL_CUT,
  processIdRequest,
  rasterImage,
  RESET,
  UNDERLINE_1DOT,
  UNDERLINE_2DOT,
  UNDERLINE_OFF,
} from '../command.js';
import { UnconfirmedPrintError } from '../errors.js';
import { bytesPerRow, RasterNode } from '../image.js';
import {
  BlankNode,
  CutNode,
  FeedNode,
  LineNode,
  PartialCutNode,
  Receipt,
  TextNode,
} from '../receipt.js';
import { describeStatus, parseOfflineCause, PrinterStatus, Reply, ReplyReader } from '../status.js';
import { PrinterConnection, TextStyle } from './printer-connection.js';

const ALIGN = { left: ALIGN_LEFT, center: ALIGN_CENTER, right: ALIGN_RIGHT } as const;
const UNDERLINE = { none: UNDERLINE_OFF, normal: UNDERLINE_1DOT, thick: UNDERLINE_2DOT } as const;

/**
 * Rows per raster command. Tall images go out as several commands that print
 * back to back, which keeps each one well within the printer's input buffer.
 */
const RASTER_BAND_ROWS = 256;

/** How long to wait for the offline cause after a job wasn't confirmed */
const STATUS_TIMEOUT = 1000;

interface Waiter {
  match(reply: Reply): boolean;
  resolve(reply: Reply | null): void;
  reject(err: Error): void;
}

/**
 * Base class for connections that send ESC/POS bytes to a real printer
 *
 * Turns receipt nodes into ESC/POS commands (text encoded as CP437). After
 * each job it sends a process ID request, and `print` resolves once the
 * printer echoes it back, which it does after the job has printed. While the
 * printer is offline (cover open, out of paper) the job waits, for up to
 * `printTimeout`.
 *
 * Subclasses provide the transport: `connect`, `write`, optionally `flush`,
 * and `close`. They pass whatever the printer sends to `receive`, and call
 * `connectionLost` if the connection drops.
 */
export abstract class EscPosConnection extends PrinterConnection {
  private readonly replies = new ReplyReader();
  private readonly waiters = new Set<Waiter>();
  private processIds = 0;
  private waiting = false;

  /** False when the printer can't send anything back; jobs then aren't confirmed */
  protected canReceive = true;

  constructor(
    width: number,
    private readonly printTimeout: number = 60_000,
  ) {
    super(width);
  }

  async open(): Promise<void> {
    this.replies.clear();
    await this.connect();
  }

  protected abstract connect(): Promise<void>;

  /**
   * Send bytes to the printer
   */
  protected abstract write(data: Uint8Array): Promise<void>;

  /** Send what `write` buffered, for connections that don't write straight through */
  protected async flush(): Promise<void> {}

  /** True while the job has been sent and the printer hasn't answered yet */
  protected get waitingForPrinter(): boolean {
    return this.waiting;
  }

  protected receive(bytes: Uint8Array): void {
    for (const reply of this.replies.push(bytes)) {
      for (const waiter of this.waiters) {
        if (waiter.match(reply)) {
          this.waiters.delete(waiter);
          waiter.resolve(reply);
        }
      }
    }
  }

  protected connectionLost(err: Error): void {
    for (const waiter of this.waiters) waiter.reject(err);
    this.waiters.clear();
  }

  /**
   * Print the receipt and wait for the printer to confirm it
   *
   * @throws {UnconfirmedPrintError} If the printer didn't confirm the job in
   *   time or the connection dropped first. The job may still print.
   */
  async print(receipt: Receipt): Promise<void> {
    await super.print(receipt);
    if (!this.canReceive) {
      await this.flush();
      return;
    }

    const id = String(this.processIds++ % 10_000).padStart(4, '0');
    const reply = await this.request(
      processIdRequest(id),
      (r) => r.kind === 'process-id' && r.id === id,
      this.printTimeout,
    );
    if (reply) return;

    const status = await this.offlineCause();
    const reason = status ? ` (${describeStatus(status)})` : ' and it no longer answers';
    throw new UnconfirmedPrintError(
      `The printer didn't confirm the job within ${String(this.printTimeout)}ms${reason}. ` +
        "It may still print once the printer is ready, so don't send it again automatically.",
      status,
    );
  }

  private async offlineCause(): Promise<PrinterStatus | null> {
    try {
      const reply = await this.request(
        OFFLINE_CAUSE_REQUEST,
        (r) => r.kind === 'real-time',
        STATUS_TIMEOUT,
      );
      return reply?.kind === 'real-time' ? parseOfflineCause(reply.byte) : null;
    } catch {
      return null;
    }
  }

  /**
   * Send a command and wait for the reply it matches. Resolves with `null`
   * after `timeout`. Rejects with the transport's error if sending fails, and
   * with an `UnconfirmedPrintError` if the connection drops while waiting.
   */
  private async request(
    command: Uint8Array,
    match: (reply: Reply) => boolean,
    timeout: number,
  ): Promise<Reply | null> {
    const { promise, resolve, reject } = Promise.withResolvers<Reply | null>();
    promise.catch(() => {});
    const waiter: Waiter = { match, resolve, reject };
    this.waiters.add(waiter);

    try {
      await this.write(command);
      await this.flush();
    } catch (err) {
      this.waiters.delete(waiter);
      throw err;
    }

    const timer = setTimeout(() => {
      this.waiters.delete(waiter);
      resolve(null);
    }, timeout);
    this.waiting = true;
    try {
      return await promise;
    } catch (cause) {
      throw new UnconfirmedPrintError(
        'The connection dropped before the printer confirmed the job. It may have printed.',
        null,
        { cause },
      );
    } finally {
      clearTimeout(timer);
      this.waiting = false;
    }
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

  protected async visitRaster(node: RasterNode): Promise<void> {
    const { bitmap } = node;
    const rowBytes = bytesPerRow(bitmap.width);

    // GS v 0 follows the justification set by ESC a
    if (node.align !== 'left') await this.write(ALIGN[node.align]);
    for (let top = 0; top < bitmap.height; top += RASTER_BAND_ROWS) {
      const rows = Math.min(RASTER_BAND_ROWS, bitmap.height - top);
      const band = bitmap.data.subarray(top * rowBytes, (top + rows) * rowBytes);
      await this.write(rasterImage(rowBytes, rows, band));
    }
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
}
