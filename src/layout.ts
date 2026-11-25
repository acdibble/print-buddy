import type {
  Align,
  InlineNode,
  LayoutNode,
  LineNode,
  PairNode,
  ParagraphNode,
  RuleNode,
  TableNode,
} from './receipt.js';

/**
 * Turns layout nodes (paragraph, rule, pair, table) into plain lines that fit
 * a given width, keeping inline styles intact.
 *
 * Widths are counted in characters, one per column, which is exact for a
 * single font. Font B characters are narrower than Font A, so Font B content
 * inside a pair or table takes less room than counted and won't line up
 * exactly.
 */
export function layout(node: LayoutNode, width: number): LineNode[] {
  switch (node.kind) {
    case 'paragraph':
      return layoutParagraph(node, width);
    case 'rule':
      return layoutRule(node, width);
    case 'pair':
      return layoutPair(node, width);
    case 'table':
      return layoutTable(node, width);
  }
}

function layoutParagraph(node: ParagraphNode, width: number): LineNode[] {
  return wrap(node.child, width).map((child) => line(child, node.align, node.flip));
}

function layoutRule(node: RuleNode, width: number): LineNode[] {
  return [line(text(repeat(node.pattern, width)))];
}

function layoutPair(node: PairNode, width: number): LineNode[] {
  const rightLength = textOf(node.right).length;
  const leftLines = wrap(node.left, width);
  const last = leftLines.pop() ?? text('');
  const gap = width - textOf(last).length - rightLength;

  const lines = leftLines.map((child) => line(child));
  if (gap >= 1) {
    lines.push(line(span([last, text(filler(node.fill, gap)), node.right])));
  } else {
    // Not enough room: finish the left side, then put the right side on its own line
    lines.push(line(last));
    for (const child of wrap(node.right, width)) lines.push(line(child, 'right'));
  }
  return lines;
}

function layoutTable(node: TableNode, width: number): LineNode[] {
  const count = node.columns.length;
  if (count === 0) return [];

  const allRows = node.header ? [node.header, ...node.rows] : node.rows;
  const widths = columnWidths(node, allRows, width - (count - 1));

  const renderRow = (row: InlineNode[]): LineNode[] => {
    const cells = node.columns.map((_, i) => wrap(row[i] ?? text(''), widths[i]));
    const height = Math.max(...cells.map((c) => c.length));
    return Array.from({ length: height }, (_, k) => {
      const parts: InlineNode[] = [];
      node.columns.forEach((column, i) => {
        if (i > 0) parts.push(text(' '));
        const isLast = i === count - 1;
        parts.push(...pad(cells[i][k] ?? text(''), widths[i], column.align, !isLast));
      });
      return line(span(parts));
    });
  };

  const lines: LineNode[] = [];
  if (node.header) {
    lines.push(...renderRow(node.header));
    if (node.divider !== null) lines.push(line(text(repeat(node.divider, width))));
  }
  for (const row of node.rows) lines.push(...renderRow(row));
  return lines;
}

/**
 * Size table columns to fit `available` characters (the width minus the
 * single-space gaps between columns).
 *
 * Fixed-width columns keep their width. Other columns start at their widest
 * cell. Spare room goes to the first flexible column, so later (usually
 * right-aligned) columns sit against the right edge. If the table is too wide,
 * the widest flexible column shrinks one character at a time.
 */
function columnWidths(node: TableNode, rows: InlineNode[][], available: number): number[] {
  const flexible: number[] = [];
  const widths = node.columns.map((column, i) => {
    if (column.width !== null) return column.width;
    flexible.push(i);
    return Math.max(1, ...rows.map((row) => (row[i] ? textOf(row[i]).length : 0)));
  });

  let total = widths.reduce((a, b) => a + b, 0);
  if (total < available && flexible.length > 0) {
    widths[flexible[0]] += available - total;
    total = available;
  }
  while (total > available) {
    const widest = flexible.reduce<number | null>(
      (best, i) => (widths[i] > 1 && (best === null || widths[i] > widths[best]) ? i : best),
      null,
    );
    if (widest === null) {
      throw new Error(
        `Table needs ${String(total + node.columns.length - 1)} characters but the paper is ${String(available + node.columns.length - 1)} wide`,
      );
    }
    widths[widest]--;
    total--;
  }
  return widths;
}

/** Pad content to `width` characters according to `align` */
function pad(content: InlineNode, width: number, align: Align, padEnd: boolean): InlineNode[] {
  const free = width - textOf(content).length;
  const before = align === 'right' ? free : align === 'center' ? Math.floor(free / 2) : 0;
  const after = free - before;
  const parts: InlineNode[] = [];
  if (before > 0) parts.push(text(' '.repeat(before)));
  parts.push(content);
  if (padEnd && after > 0) parts.push(text(' '.repeat(after)));
  return parts;
}

/** The gap between the two sides of a pair: spaces, or a pattern with a space either side */
function filler(fill: string, gap: number): string {
  if (fill === ' ' || gap < 3) return ' '.repeat(gap);
  return ' ' + repeat(fill, gap - 2) + ' ';
}

function repeat(pattern: string, length: number): string {
  return pattern.repeat(Math.ceil(length / pattern.length)).slice(0, length);
}

/**
 * Word-wrap styled content into pieces of at most `width` characters.
 * Breaks at spaces where possible, and mid-word only when a word is too long.
 */
export function wrap(node: InlineNode, width: number): InlineNode[] {
  const plain = textOf(node);
  const pieces: InlineNode[] = [];
  let start = 0;

  while (start < plain.length) {
    let end = Math.min(start + width, plain.length);
    if (end < plain.length) {
      const space = plain.lastIndexOf(' ', end);
      if (space > start) end = space;
    }
    let trimmed = end;
    while (trimmed > start && plain[trimmed - 1] === ' ') trimmed--;
    pieces.push(slice(node, start, trimmed));

    start = end;
    while (plain[start] === ' ') start++;
  }

  return pieces.length > 0 ? pieces : [text('')];
}

/** The characters of an inline node, without styling */
export function textOf(node: InlineNode): string {
  switch (node.kind) {
    case 'text':
      return node.value;
    case 'span':
      return node.children.map(textOf).join('');
    default:
      return textOf(node.child);
  }
}

/** The part of an inline node covering characters [start, end), with its styles */
function slice(node: InlineNode, start: number, end: number): InlineNode {
  switch (node.kind) {
    case 'text':
      return text(node.value.slice(start, end));
    case 'span': {
      const children: InlineNode[] = [];
      let offset = 0;
      for (const child of node.children) {
        const length = textOf(child).length;
        const from = Math.max(start, offset);
        const to = Math.min(end, offset + length);
        if (from < to) children.push(slice(child, from - offset, to - offset));
        offset += length;
      }
      return span(children);
    }
    default:
      return { ...node, child: slice(node.child, start, end) };
  }
}

function text(value: string): InlineNode {
  return { kind: 'text', value };
}

function span(children: InlineNode[]): InlineNode {
  return { kind: 'span', children };
}

function line(child: InlineNode, align: Align = 'left', flip = false): LineNode {
  return { kind: 'line', child, align, flip };
}
