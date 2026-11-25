/**
 * AST node types for receipt documents
 *
 * Inline nodes style text character by character and can nest freely.
 * Block nodes make up the receipt itself; each one is a line, a gap, or a
 * paper command.
 */
export type TextNode = { kind: 'text'; value: string };
export type BoldNode = { kind: 'bold'; child: InlineNode };
export type UnderlineNode = { kind: 'underline'; child: InlineNode; type: 'normal' | 'thick' };
export type FontBNode = { kind: 'fontB'; child: InlineNode };
export type SpanNode = { kind: 'span'; children: InlineNode[] };

export type InlineNode = TextNode | BoldNode | UnderlineNode | FontBNode | SpanNode;

/**
 * Inline content: a string, a styled node, or an array of either to put
 * several differently styled pieces side by side
 *
 * @example
 * ['Total: ', bold('$5.50')]
 */
export type Content = string | InlineNode | readonly Content[];

export type Align = 'left' | 'center' | 'right';

/**
 * Settings that apply to a whole printed line
 *
 * The printer reads these when the line prints, not character by character,
 * so they belong to the line rather than to its content.
 */
export interface LineOptions {
  /** Horizontal alignment (default: 'left') */
  align?: Align;
  /** Print the line upside-down, rotated 180° (default: false) */
  flip?: boolean;
}

export interface PairOptions {
  /** Pattern filling the gap between left and right, e.g. '.' for dot leaders (default: ' ') */
  fill?: string;
}

export interface TableColumn {
  /** Cell alignment (default: 'left' for the first column, 'right' for the rest) */
  align?: Align;
  /** Fixed width in characters (default: sized to fit the content) */
  width?: number;
}

export interface TableOptions {
  /** Column settings; the table has as many columns as its widest row */
  columns?: TableColumn[];
  /** Header cells, printed above the rows */
  header?: Content[];
  /** Body rows */
  rows: Content[][];
  /** Pattern for the line under the header, or false for none (default: '-') */
  divider?: string | false;
}

export type LineNode = { kind: 'line'; child: InlineNode; align: Align; flip: boolean };
export type ParagraphNode = { kind: 'paragraph'; child: InlineNode; align: Align; flip: boolean };
export type RuleNode = { kind: 'rule'; pattern: string };
export type PairNode = { kind: 'pair'; left: InlineNode; right: InlineNode; fill: string };
export type TableNode = {
  kind: 'table';
  columns: { align: Align; width: number | null }[];
  header: InlineNode[] | null;
  rows: InlineNode[][];
  divider: string | null;
};
export type BlankNode = { kind: 'blank'; count: number };
export type FeedNode = { kind: 'feed' };
export type CutNode = { kind: 'cut' };
export type PartialCutNode = { kind: 'partialCut' };

/** Block nodes that are laid out to fit the paper width when printed */
export type LayoutNode = ParagraphNode | RuleNode | PairNode | TableNode;

export type BlockNode = LineNode | LayoutNode | BlankNode | FeedNode | CutNode | PartialCutNode;

export type Node = InlineNode | BlockNode;

function toNode(content: Content): InlineNode {
  if (typeof content === 'string') return { kind: 'text', value: content };
  if ('kind' in content) return content;
  return { kind: 'span', children: content.map(toNode) };
}

/**
 * Wrap content in bold styling
 */
export function bold(content: Content): BoldNode {
  return { kind: 'bold', child: toNode(content) };
}

/**
 * Wrap content in underline styling
 */
export function underline(content: Content, type: 'normal' | 'thick' = 'normal'): UnderlineNode {
  return { kind: 'underline', child: toNode(content), type };
}

/**
 * Render content in Font B (narrower, more columns per line)
 */
export function fontB(content: Content): FontBNode {
  return { kind: 'fontB', child: toNode(content) };
}

/**
 * Receipt builder for creating printable documents using AST
 *
 * @example
 * const receipt = new Receipt()
 *   .line(bold('Store Name'), { align: 'center' })
 *   .line(underline('Order #12345'))
 *   .blank()
 *   .table({ header: ['Item', 'Price'], rows: [['Coffee', '$3.50']] })
 *   .rule()
 *   .pair(bold('Total'), bold('$3.50'))
 *   .cut();
 *
 * await printer.print(receipt);
 */
export class Receipt {
  private _nodes: BlockNode[] = [];

  /**
   * Add a line (prints content followed by newline)
   */
  line(content: Content, options: LineOptions = {}): this {
    this._nodes.push({
      kind: 'line',
      child: toNode(content),
      align: options.align ?? 'left',
      flip: options.flip ?? false,
    });
    return this;
  }

  /**
   * Add text that word-wraps to the paper width
   */
  paragraph(content: Content, options: LineOptions = {}): this {
    this._nodes.push({
      kind: 'paragraph',
      child: toNode(content),
      align: options.align ?? 'left',
      flip: options.flip ?? false,
    });
    return this;
  }

  /**
   * Add a line that fills the paper width with a repeated pattern
   */
  rule(pattern: string = '-'): this {
    if (pattern.length === 0) throw new Error('rule() pattern must not be empty');
    this._nodes.push({ kind: 'rule', pattern });
    return this;
  }

  /**
   * Add a line with content at the left and right edges, e.g. a label and a price
   *
   * If both don't fit on one line, the right side moves to the next line.
   */
  pair(left: Content, right: Content, options: PairOptions = {}): this {
    const fill = options.fill ?? ' ';
    if (fill.length === 0) throw new Error('pair() fill must not be empty');
    this._nodes.push({ kind: 'pair', left: toNode(left), right: toNode(right), fill });
    return this;
  }

  /**
   * Add a table whose columns are sized to fit the paper width
   *
   * Cells that don't fit their column wrap onto extra lines.
   */
  table(options: TableOptions): this {
    const header = options.header?.map(toNode) ?? null;
    const rows = options.rows.map((row) => row.map(toNode));
    const count = Math.max(
      options.columns?.length ?? 0,
      header?.length ?? 0,
      ...rows.map((row) => row.length),
    );
    const columns = Array.from({ length: count }, (_, i) => {
      const column = options.columns?.[i] ?? {};
      if (column.width !== undefined && column.width < 1) {
        throw new Error(`table() column ${String(i)} width must be at least 1`);
      }
      return {
        align: column.align ?? (i === 0 ? 'left' : 'right'),
        width: column.width ?? null,
      } as const;
    });
    const divider = options.divider === false ? null : (options.divider ?? '-');
    if (divider === '') throw new Error('table() divider must not be empty');
    this._nodes.push({ kind: 'table', columns, header, rows, divider });
    return this;
  }

  /**
   * Add blank lines
   */
  blank(count: number = 1): this {
    this._nodes.push({ kind: 'blank', count });
    return this;
  }

  /**
   * Feed paper without cutting (for manual tear-off)
   */
  feed(): this {
    this._nodes.push({ kind: 'feed' });
    return this;
  }

  /**
   * Add a full paper cut command
   */
  cut(): this {
    this._nodes.push({ kind: 'cut' });
    return this;
  }

  /**
   * Add a partial (half) paper cut command
   */
  partialCut(): this {
    this._nodes.push({ kind: 'partialCut' });
    return this;
  }

  /**
   * Add the contents of other receipts, e.g. a shared header or footer
   *
   * Copies the nodes the other receipts have now; later changes to them don't
   * affect this receipt.
   *
   * @example
   * const footer = new Receipt().rule().line('Thank you!', { align: 'center' });
   * new Receipt().line('Order #1').append(footer);
   */
  append(...receipts: Receipt[]): this {
    for (const receipt of receipts) this._nodes.push(...receipt._nodes);
    return this;
  }

  /**
   * Add content for each item without breaking the chain
   *
   * @example
   * receipt.each(items, (r, item) => r.pair(item.name, item.price));
   */
  each<T>(items: Iterable<T>, add: (receipt: this, item: T, index: number) => unknown): this {
    let index = 0;
    for (const item of items) add(this, item, index++);
    return this;
  }

  /**
   * Add content only if a condition holds, without breaking the chain
   *
   * @example
   * receipt.when(order.tip > 0, (r) => r.pair('Tip', formatPrice(order.tip)));
   */
  when(condition: unknown, add: (receipt: this) => unknown): this {
    if (condition) add(this);
    return this;
  }

  /**
   * Get all nodes in the receipt
   *
   * Returns a copy, so changing the array doesn't change the receipt.
   */
  nodes(): readonly BlockNode[] {
    return [...this._nodes];
  }
}
