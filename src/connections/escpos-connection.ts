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
  PARTIAL_CUT,
  rasterImage,
  RESET,
  UNDERLINE_1DOT,
  UNDERLINE_2DOT,
  UNDERLINE_OFF,
} from '../command.js';
import { bytesPerRow, RasterNode } from '../image.js';
import { BlankNode, CutNode, FeedNode, LineNode, PartialCutNode, TextNode } from '../receipt.js';
import { PrinterConnection, TextStyle } from './printer-connection.js';

const ALIGN = { left: ALIGN_LEFT, center: ALIGN_CENTER, right: ALIGN_RIGHT } as const;
const UNDERLINE = { none: UNDERLINE_OFF, normal: UNDERLINE_1DOT, thick: UNDERLINE_2DOT } as const;

/**
 * Rows per raster command. Tall images go out as several commands that print
 * back to back, which keeps each one well within the printer's input buffer.
 */
const RASTER_BAND_ROWS = 256;

/**
 * Base class for connections that send ESC/POS bytes to a real printer
 *
 * Turns receipt nodes into ESC/POS commands (text encoded as CP437).
 * Subclasses only provide the transport through `write`.
 */
export abstract class EscPosConnection extends PrinterConnection {
  /**
   * Send bytes to the printer
   */
  protected abstract write(data: Uint8Array): Promise<void>;

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
