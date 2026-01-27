/**
 * Options for table formatting
 */
export interface TableOptions {
  /** Pattern used to divide header from rows (e.g., '-') */
  headerDivisionPattern?: string;
  /** Pattern used to join columns (not commonly used) */
  joinColumnsPattern?: string;
}

/**
 * Helper class to format text for thermal printers
 *
 * The Formatter helps create formatted text like tables and word-wrapped text.
 */
export class Formatter {
  private tableOptions: TableOptions;
  private width: number;

  /**
   * Create a new formatter with a default width
   */
  constructor(width: number) {
    this.width = width;
    this.tableOptions = {
      headerDivisionPattern: '-',
      joinColumnsPattern: undefined,
    };
  }

  /**
   * Set new table options
   */
  setTableOptions(options: TableOptions): void {
    this.tableOptions = options;
  }

  /**
   * Get the current table options
   */
  getTableOptions(): TableOptions {
    return this.tableOptions;
  }

  /**
   * Modify table options via a callback
   */
  modifyTableOptions(modifier: (options: TableOptions) => void): void {
    modifier(this.tableOptions);
  }

  /**
   * Split a string by whitespaces according to the formatter width
   *
   * @example
   * const formatter = new Formatter(16);
   * const result = formatter.spaceSplit("Sentence with two lines.");
   * // Returns: "Sentence with\ntwo lines."
   */
  spaceSplit(source: string): string {
    const lines = source.split('\n');
    const result = lines
      .map((line) => {
        let currentLine = '';
        const brokenLines: string[] = [];

        const words = line.split(/\s+/).filter((w) => w.length > 0);

        for (const word of words) {
          const numChars = word.length;

          // Check if we can add to current line (with space separator)
          if (currentLine.length + numChars + 1 < this.width) {
            currentLine += (currentLine.length === 0 ? '' : ' ') + word;
          } else {
            // Need to start a new line
            if (currentLine.length > 0) {
              brokenLines.push(currentLine);
            }

            if (numChars < this.width) {
              // Start new line with current word
              currentLine = word;
            } else {
              // Word is too long, split it
              let remaining = word;
              while (remaining.length > 0) {
                const fragment = remaining.slice(0, this.width);
                brokenLines.push(fragment);
                remaining = remaining.slice(this.width);
              }
              currentLine = '';
            }
          }
        }

        if (currentLine.length > 0) {
          brokenLines.push(currentLine);
        }

        return brokenLines.join('\n');
      })
      .join('');

    // Preserve trailing newline if present
    if (source.endsWith('\n')) {
      return result + '\n';
    }
    return result;
  }

  /**
   * Create the header division pattern line
   */
  private printHeaderDivisionPattern(): string | null {
    if (this.tableOptions.headerDivisionPattern) {
      const pattern = this.tableOptions.headerDivisionPattern;
      const repeatCount = Math.ceil(this.width / pattern.length) + 1;
      let line = pattern.repeat(repeatCount);
      line = line.slice(0, this.width);
      return line + '\n';
    }
    return null;
  }

  /**
   * Create a table with two columns
   *
   * @example
   * const formatter = new Formatter(20);
   * const result = formatter.duoTable(
   *   ['Product', 'Price'],
   *   [['Milk', '5.00'], ['Cereal', '10.00']]
   * );
   */
  duoTable(headers: [string, string], rows: Array<[string, string]>): string {
    const auxDuoTable = (
      first: string,
      second: string,
      width: number,
      replaceLast?: string,
    ): string => {
      let col1 = first;
      let col2 = second;
      const rowWidth = col1.length + col2.length;

      if (rowWidth >= width) {
        // If second column requires all space
        if (col2.length + 4 > width) {
          if (replaceLast) {
            col2 = col2.slice(0, width - 5) + replaceLast;
          } else {
            col2 = col2.slice(0, width - 4);
          }
        }

        // Calculate remaining space for first column
        const remaining = width - col2.length;
        if (col1.length > remaining) {
          if (replaceLast) {
            col1 = col1.slice(0, remaining - 2) + replaceLast;
          } else {
            col1 = col1.slice(0, remaining - 1);
          }
        }
      }

      // Format: left-aligned first, right-aligned second
      const padding = width - col1.length - 1;
      return col1 + ' ' + col2.padStart(padding) + '\n';
    };

    let content = auxDuoTable(headers[0], headers[1], this.width, '.');

    const hdp = this.printHeaderDivisionPattern();
    if (hdp) {
      content += hdp;
    }

    for (const row of rows) {
      content += auxDuoTable(row[0], row[1], this.width);
    }

    return content;
  }

  /**
   * Create a table with three columns
   *
   * @example
   * const formatter = new Formatter(20);
   * const result = formatter.trioTable(
   *   ['Product', 'Price', 'Qty.'],
   *   [['Milk', '5.00', '3'], ['Cereal', '10.00', '1']]
   * );
   */
  trioTable(headers: [string, string, string], rows: Array<[string, string, string]>): string {
    // Find max widths
    let maxLeft = headers[0].length;
    let maxMiddle = headers[1].length;
    let maxRight = headers[2].length;

    for (const row of rows) {
      if (row[0].length > maxLeft) maxLeft = row[0].length;
      if (row[1].length > maxMiddle) maxMiddle = row[1].length;
      if (row[2].length > maxRight) maxRight = row[2].length;
    }

    // Calculate column limits
    let limits: [number, number];
    if (maxLeft + maxMiddle + maxRight + 2 < this.width) {
      limits = [maxLeft + 1, this.width - maxRight - 1];
    } else {
      let limit0: number;
      if (maxMiddle + maxRight + 4 > this.width) {
        limit0 = 4;
      } else {
        limit0 = this.width - maxMiddle - maxRight;
      }

      const remaining = this.width - limit0;
      let limit1: number;
      if (maxRight + 4 > remaining) {
        limit1 = limit0 + 4;
      } else {
        limit1 = limit0 + remaining - maxRight;
      }

      limits = [limit0, limit1];
    }

    const auxTrioTable = (
      first: string,
      second: string,
      third: string,
      width: number,
      limits: [number, number],
      replaceLast?: string,
    ): string => {
      let col1 = first;
      let col2 = second;
      let col3 = third;

      const maxWidth1 = limits[0] - 1;
      if (col1.length > maxWidth1) {
        col1 = replaceLast ? col1.slice(0, maxWidth1) + replaceLast : col1.slice(0, maxWidth1);
      }

      const maxWidth2 = limits[1] - limits[0];
      if (col2.length > maxWidth2) {
        col2 = replaceLast ? col2.slice(0, maxWidth2) + replaceLast : col2.slice(0, maxWidth2);
      }

      const maxWidth3 = width - limits[1];
      if (col3.length - 1 > maxWidth3) {
        col3 = replaceLast ? col3.slice(0, maxWidth3) + replaceLast : col3.slice(0, maxWidth3);
      }

      // Format: left-aligned, centered, right-aligned
      const col1Padded = col1.padEnd(limits[0] - 1);
      const col2Width = limits[1] - limits[0];
      const col2Padded = col2.padStart(Math.floor((col2Width + col2.length) / 2)).padEnd(col2Width);
      const col3Width = width - limits[1] - 1;
      const col3Padded = col3.padStart(col3Width);

      return col1Padded + ' ' + col2Padded + ' ' + col3Padded + '\n';
    };

    let content = auxTrioTable(headers[0], headers[1], headers[2], this.width, limits);

    const hdp = this.printHeaderDivisionPattern();
    if (hdp) {
      content += hdp;
    }

    for (const row of rows) {
      content += auxTrioTable(row[0], row[1], row[2], this.width, limits);
    }

    return content;
  }
}
