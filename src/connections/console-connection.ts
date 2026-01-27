import { Node } from '../receipt.js';
import { PrinterConnection } from './printer-connection.js';

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

  protected async visitText(value: string): Promise<void> {
    process.stdout.write(value);
  }

  protected async visitBold(child: Node): Promise<void> {
    process.stdout.write(ANSI.bold);
    await this.visit(child);
    process.stdout.write(ANSI.reset);
  }

  protected async visitUnderline(child: Node): Promise<void> {
    process.stdout.write(ANSI.underline);
    await this.visit(child);
    process.stdout.write(ANSI.reset);
  }

  protected async visitLeft(child: Node): Promise<void> {
    await this.visit(child);
  }

  protected async visitCenter(child: Node): Promise<void> {
    const text = this.extractText(child);
    const padding = Math.max(0, Math.floor((this.width - text.length) / 2));
    process.stdout.write(' '.repeat(padding));
    await this.visit(child);
  }

  protected async visitRight(child: Node): Promise<void> {
    const text = this.extractText(child);
    const padding = Math.max(0, this.width - text.length);
    process.stdout.write(' '.repeat(padding));
    await this.visit(child);
  }

  private extractText(node: Node): string {
    switch (node.kind) {
      case 'text':
        return node.value;
      case 'bold':
      case 'underline':
      case 'left':
      case 'center':
      case 'right':
      case 'line':
        return this.extractText(node.child);
      default:
        return '';
    }
  }

  protected async visitLine(child: Node): Promise<void> {
    await this.visit(child);
    process.stdout.write('\n');
  }

  protected async visitBlank(count: number): Promise<void> {
    process.stdout.write('\n'.repeat(count));
  }

  protected async visitTable(headers: [string, string], rows: [string, string][]): Promise<void> {
    const output = this.formatter.duoTable(headers, rows);
    process.stdout.write(output);
  }

  protected async visitFeed(): Promise<void> {
    process.stdout.write('\n\n\n\n');
  }

  protected async visitCut(): Promise<void> {
    const line = ANSI.dim + '\u2702 ' + '\u2500'.repeat(this.width - 2) + ANSI.reset + '\n';
    process.stdout.write(line);
  }

  protected async visitPartialCut(): Promise<void> {
    const line = ANSI.dim + '\u2702 ' + '\u254C'.repeat(this.width - 2) + ANSI.reset + '\n';
    process.stdout.write(line);
  }

  protected async reset(): Promise<void> {
    process.stdout.write(ANSI.reset);
  }

  async close(): Promise<void> {}
}
