import { textOf } from '../layout.js';
import { BlankNode, CutNode, FeedNode, LineNode, PartialCutNode, TextNode } from '../receipt.js';
import { PrinterConnection, TextStyle } from './printer-connection.js';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  underline: '\x1b[4m',
  dim: '\x1b[2m',
};

/**
 * Console connection for testing without hardware
 *
 * Outputs text to the console using ANSI escape codes for styling.
 */
export class ConsoleConnection extends PrinterConnection {
  constructor(width: number = 32) {
    super(width);
  }

  protected async visitText(node: TextNode): Promise<void> {
    process.stdout.write(node.value);
  }

  protected async applyStyle(next: TextStyle, previous: TextStyle): Promise<void> {
    // ANSI has no reliable per-style "off" code, so when a style ends, reset
    // everything and switch the remaining styles back on.
    const turnedOff =
      (previous.bold && !next.bold) || (previous.underline !== 'none' && next.underline === 'none');
    let codes = turnedOff ? ANSI.reset : '';
    if (next.bold && (turnedOff || !previous.bold)) codes += ANSI.bold;
    if (next.underline !== 'none' && (turnedOff || previous.underline === 'none')) {
      codes += ANSI.underline;
    }
    // Font B has no terminal equivalent, so it's ignored
    if (codes) process.stdout.write(codes);
  }

  protected async visitLine(node: LineNode): Promise<void> {
    // The console can't print upside-down, so node.flip is ignored
    const free = Math.max(0, this.width - textOf(node.child).length);
    const padding =
      node.align === 'center' ? Math.floor(free / 2) : node.align === 'right' ? free : 0;
    process.stdout.write(' '.repeat(padding));
    await this.visit(node.child);
    process.stdout.write('\n');
  }

  protected async visitBlank(node: BlankNode): Promise<void> {
    process.stdout.write('\n'.repeat(node.count));
  }

  protected async visitFeed(_node: FeedNode): Promise<void> {
    process.stdout.write('\n\n\n\n');
  }

  protected async visitCut(_node: CutNode): Promise<void> {
    const line = ANSI.dim + '\u2702 ' + '\u2500'.repeat(this.width - 2) + ANSI.reset + '\n';
    process.stdout.write(line);
  }

  protected async visitPartialCut(_node: PartialCutNode): Promise<void> {
    const line = ANSI.dim + '\u2702 ' + '\u254C'.repeat(this.width - 2) + ANSI.reset + '\n';
    process.stdout.write(line);
  }

  protected async reset(): Promise<void> {
    process.stdout.write(ANSI.reset);
  }

  async close(): Promise<void> {}
}
