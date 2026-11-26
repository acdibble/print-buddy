import iconv from 'iconv-lite';

import { type Bitmap, renderBlocks } from '../../image.js';

/**
 * Virtual ESC/POS printer for tests.
 *
 * Interprets the byte stream a connection sends and models the paper that
 * would come out: lines with alignment, styled text runs, and cuts. `render()`
 * draws that paper as text so snapshots show what would actually print.
 *
 * Timing model:
 * - Character styles (bold, underline, font) apply per character as it arrives.
 * - Alignment and upside-down mode are line-level: the value in effect when
 *   the line is printed (LF, wrap, or ESC d) applies to the whole line. This
 *   matches what commit 36c59d6 found on the TM-T20III, where a mid-line
 *   ESC a still changed the alignment of the line being printed.
 * - Text sits in the buffer until a line feed. Text never followed by one is
 *   reported as a warning, because a real printer would never print it.
 * - Raster images (GS v 0) print at once with the alignment in effect. Back to
 *   back images of the same width merge, as they do on paper, so an image
 *   sent in bands renders as one. The printer ignores GS v 0 while text is
 *   buffered, so that's a warning too.
 *
 * - Status requests (DLE EOT, GS ( H) print nothing and are skipped.
 *
 * Unknown commands throw, so tests fail if the library starts emitting bytes
 * this model doesn't understand.
 */

/** Character widths in dots (Epson Font A 12×24, Font B 9×17) */
const CHAR_DOTS = { A: 12, B: 9 } as const;

type Font = keyof typeof CHAR_DOTS;
type Align = 'left' | 'center' | 'right';

export interface Style {
  bold: boolean;
  underline: 0 | 1 | 2;
  font: Font;
}

export interface Run {
  text: string;
  style: Style;
}

export type PaperItem =
  | { kind: 'line'; align: Align; upsideDown: boolean; runs: Run[] }
  | { kind: 'image'; align: Align; bitmap: Bitmap }
  | { kind: 'cut'; partial: boolean };

interface State {
  style: Style;
  align: Align;
  upsideDown: boolean;
}

function initialState(): State {
  return { style: { bold: false, underline: 0, font: 'A' }, align: 'left', upsideDown: false };
}

const ESC = 0x1b;
const GS = 0x1d;
const DLE = 0x10;
const LF = 0x0a;

const hex = (b: number) => `0x${b.toString(16).padStart(2, '0')}`;

export class VirtualPrinter {
  readonly paper: PaperItem[] = [];
  readonly warnings: string[] = [];

  private state = initialState();
  private runs: Run[] = [];
  private usedDots = 0;
  private readonly widthDots: number;

  /**
   * @param columns Font A columns per line (printable width = columns × 12 dots)
   */
  constructor(private readonly columns: number) {
    this.widthDots = columns * CHAR_DOTS.A;
  }

  /** Feed bytes to the printer */
  write(data: Iterable<number>): this {
    const bytes = Uint8Array.from(data);
    let i = 0;

    const arg = (command: string): number => {
      if (i >= bytes.length) throw new Error(`${command}: missing argument at end of data`);
      return bytes[i++];
    };

    while (i < bytes.length) {
      const offset = i;
      const b = bytes[i++];

      if (b === ESC) {
        const cmd = arg('ESC');
        const name = `ESC ${String.fromCharCode(cmd)}`;
        switch (cmd) {
          case 0x40: // ESC @ - initialize
            if (this.runs.length > 0) {
              this.warnings.push(`ESC @ discarded unprinted text "${this.bufferedText()}"`);
            }
            this.state = initialState();
            this.runs = [];
            this.usedDots = 0;
            break;
          case 0x61: // ESC a n - justification
            this.state.align = pick(name, arg(name), ['left', 'center', 'right'] as const);
            break;
          case 0x45: // ESC E n - emphasized
            this.setStyle({ bold: (arg(name) & 1) === 1 });
            break;
          case 0x2d: // ESC - n - underline
            this.setStyle({ underline: pick(name, arg(name), [0, 1, 2] as const) });
            break;
          case 0x4d: // ESC M n - character font
            this.setStyle({ font: pick(name, arg(name), ['A', 'B'] as const) });
            break;
          case 0x7b: // ESC { n - upside-down mode
            this.state.upsideDown = (arg(name) & 1) === 1;
            break;
          case 0x64: {
            // ESC d n - print buffer and feed n lines
            const n = arg(name);
            if (this.runs.length > 0) this.printLine();
            for (let k = 0; k < n; k++) this.printLine();
            break;
          }
          default:
            throw new Error(`Unsupported command ESC ${hex(cmd)} at byte ${String(offset)}`);
        }
      } else if (b === GS) {
        const cmd = arg('GS');
        if (cmd === 0x76) {
          i = this.rasterImage(bytes, i, offset);
          continue;
        }
        if (cmd === 0x28 && bytes[i] === 0x48) {
          // GS ( H pL pH fn m d1...d4 - request a process ID response
          i++;
          const length = arg('GS ( H') + arg('GS ( H') * 256;
          if (i + length > bytes.length) throw new Error('GS ( H: missing data at end of data');
          i += length;
          continue;
        }
        if (cmd !== 0x56) {
          throw new Error(`Unsupported command GS ${hex(cmd)} at byte ${String(offset)}`);
        }
        // GS V m [n] - cut (m = 65/66 take a feed amount n)
        const m = arg('GS V');
        if (m === 65 || m === 66) arg('GS V');
        else if (![0, 1, 48, 49].includes(m)) throw new Error(`GS V: invalid mode ${String(m)}`);
        if (this.runs.length > 0) {
          this.warnings.push(`cut while text was still buffered: "${this.bufferedText()}"`);
        }
        this.paper.push({ kind: 'cut', partial: m === 1 || m === 49 || m === 66 });
      } else if (b === DLE && bytes[i] === 0x04) {
        // DLE EOT n - real-time status request
        i++;
        arg('DLE EOT');
      } else if (b === LF) {
        this.printLine();
      } else if (b === 0x0d) {
        // CR is ignored when auto line feed is off (the default)
      } else if (b < 0x20 || b === 0x7f) {
        throw new Error(`Unsupported control byte ${hex(b)} at byte ${String(offset)}`);
      } else {
        let end = i;
        while (end < bytes.length && bytes[end] >= 0x20 && bytes[end] !== 0x7f) end++;
        for (const ch of iconv.decode(Buffer.from(bytes.subarray(offset, end)), 'cp437')) {
          this.addChar(ch);
        }
        i = end;
      }
    }

    return this;
  }

  /** Draw the paper as text, followed by any warnings */
  render(): string {
    const out: string[] = [];
    const rule = (ch: string) => ch.repeat(this.columns);
    let open = false;

    for (const item of this.paper) {
      if (!open) {
        out.push(`┌${rule('─')}┐`);
        open = true;
      }
      if (item.kind === 'cut') {
        out.push(item.partial ? `└${rule('╌')}┘ ✂ partial cut` : `└${rule('─')}┘ ✂ cut`);
        open = false;
      } else if (item.kind === 'image') {
        out.push(...this.renderImage(item));
      } else {
        out.push(this.renderLine(item));
      }
    }
    if (open) out.push(`└${rule('─')}┘ (no cut)`);

    const pending = this.bufferedText();
    const warnings = pending
      ? [...this.warnings, `text never printed (no line feed): "${pending}"`]
      : this.warnings;
    for (const w of warnings) out.push(`⚠ ${w}`);

    return out.join('\n');
  }

  private renderLine(line: Extract<PaperItem, { kind: 'line' }>): string {
    const text = line.runs.map((r) => r.text).join('');
    const dots = line.runs.reduce((sum, r) => sum + r.text.length * CHAR_DOTS[r.style.font], 0);
    const free = this.widthDots - dots;

    // Upside-down mode rotates the whole line 180°, so seen with the paper the
    // right way up, left-aligned text ends up at the right edge.
    let align = line.align;
    if (line.upsideDown && align !== 'center') align = align === 'left' ? 'right' : 'left';

    const padDots = align === 'center' ? Math.floor(free / 2) : align === 'right' ? free : 0;
    const content = ' '.repeat(Math.round(padDots / CHAR_DOTS.A)) + text;
    const body = content.padEnd(this.columns);

    const labels: string[] = [];
    if (line.upsideDown) labels.push('upside-down');
    const styled = line.runs.filter((r) => styleLabel(r.style) !== '');
    if (styled.length === 1 && line.runs.length === 1) {
      labels.push(styleLabel(styled[0].style));
    } else {
      for (const r of styled) labels.push(`${styleLabel(r.style)} "${r.text}"`);
    }

    return `│${body}│${labels.length > 0 ? ' ' + labels.join(' · ') : ''}`;
  }

  /**
   * GS v 0 m xL xH yL yH d1...dk - print raster bit image. `i` points just
   * after "GS v"; returns the index after the image data.
   */
  private rasterImage(bytes: Uint8Array, i: number, offset: number): number {
    const header = bytes.subarray(i, i + 6);
    if (header.length < 6) throw new Error('GS v: missing arguments at end of data');
    const [fn, m, xL, xH, yL, yH] = header;
    if (fn !== 0x30)
      throw new Error(`Unsupported command GS v ${hex(fn)} at byte ${String(offset)}`);
    if (m !== 0 && m !== 48) throw new Error(`GS v 0: unsupported scaling mode ${String(m)}`);
    const rowBytes = xL + xH * 256;
    const height = yL + yH * 256;
    if (rowBytes < 1 || height < 1) throw new Error('GS v 0: empty image');
    const start = i + 6;
    const end = start + rowBytes * height;
    if (end > bytes.length) {
      throw new Error(
        `GS v 0: expected ${String(rowBytes * height)} bytes of image data, got ${String(bytes.length - start)}`,
      );
    }

    if (this.runs.length > 0) {
      this.warnings.push(`GS v 0 ignored while text was buffered: "${this.bufferedText()}"`);
      return end;
    }
    const width = rowBytes * 8;
    if (width > this.widthDots) {
      this.warnings.push(
        `image is ${String(width)} dots wide but the paper fits ${String(this.widthDots)}`,
      );
    }

    const data = bytes.slice(start, end);
    const last = this.paper.at(-1);
    if (last?.kind === 'image' && last.align === this.state.align && last.bitmap.width === width) {
      const merged = new Uint8Array(last.bitmap.data.length + data.length);
      merged.set(last.bitmap.data);
      merged.set(data, last.bitmap.data.length);
      last.bitmap = { width, height: last.bitmap.height + height, data: merged };
    } else {
      this.paper.push({ kind: 'image', align: this.state.align, bitmap: { width, height, data } });
    }
    return end;
  }

  private renderImage(item: Extract<PaperItem, { kind: 'image' }>): string[] {
    const free = Math.max(0, this.widthDots - item.bitmap.width);
    const padDots =
      item.align === 'center' ? Math.floor(free / 2) : item.align === 'right' ? free : 0;
    const padding = ' '.repeat(Math.round(padDots / CHAR_DOTS.A));
    const label = ` image ${String(item.bitmap.width)}×${String(item.bitmap.height)}`;
    return renderBlocks(item.bitmap).map(
      (row, n) => `│${(padding + row).padEnd(this.columns)}│${n === 0 ? label : ''}`,
    );
  }

  private setStyle(patch: Partial<Style>): void {
    this.state.style = { ...this.state.style, ...patch };
  }

  private addChar(ch: string): void {
    const width = CHAR_DOTS[this.state.style.font];
    if (this.usedDots + width > this.widthDots) this.printLine(); // printer auto-wraps

    const last = this.runs.at(-1);
    if (last && sameStyle(last.style, this.state.style)) {
      last.text += ch;
    } else {
      this.runs.push({ text: ch, style: { ...this.state.style } });
    }
    this.usedDots += width;
  }

  private printLine(): void {
    this.paper.push({
      kind: 'line',
      align: this.state.align,
      upsideDown: this.state.upsideDown,
      runs: this.runs,
    });
    this.runs = [];
    this.usedDots = 0;
  }

  private bufferedText(): string {
    return this.runs.map((r) => r.text).join('');
  }
}

function pick<T>(command: string, n: number, values: readonly T[]): T {
  // ESC/POS accepts both n and ASCII '0' + n for these arguments
  const index = n >= 48 ? n - 48 : n;
  if (index >= values.length) throw new Error(`${command}: invalid argument ${String(n)}`);
  return values[index];
}

function sameStyle(a: Style, b: Style): boolean {
  return a.bold === b.bold && a.underline === b.underline && a.font === b.font;
}

function styleLabel(style: Style): string {
  const parts: string[] = [];
  if (style.bold) parts.push('bold');
  if (style.underline === 1) parts.push('underline');
  if (style.underline === 2) parts.push('thick underline');
  if (style.font === 'B') parts.push('font B');
  return parts.join('+');
}
