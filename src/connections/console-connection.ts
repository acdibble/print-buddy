import { PrinterConnection } from './printer-connection';
import { Node } from '../receipt';

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

  protected async visitLine(child: Node): Promise<void> {
    await this.visit(child);
    process.stdout.write('\n');
  }

  protected async visitBlank(count: number): Promise<void> {
    process.stdout.write('\n'.repeat(count));
  }

  protected async visitTable(
    headers: [string, string],
    rows: [string, string][]
  ): Promise<void> {
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

  async close(): Promise<void> {}
}
