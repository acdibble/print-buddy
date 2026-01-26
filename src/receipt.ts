/**
 * AST Node types for receipt documents
 */
export type Node =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; child: Node }
  | { kind: 'underline'; child: Node }
  | { kind: 'left'; child: Node }
  | { kind: 'center'; child: Node }
  | { kind: 'right'; child: Node }
  | { kind: 'line'; child: Node }
  | { kind: 'blank'; count: number }
  | { kind: 'table'; headers: [string, string]; rows: [string, string][] }
  | { kind: 'feed' }
  | { kind: 'cut' }
  | { kind: 'partialCut' };

function toNode(content: string | Node): Node {
  return typeof content === 'string' ? { kind: 'text', value: content } : content;
}

/**
 * Wrap content in bold styling
 */
export function bold(content: string | Node): Node {
  return { kind: 'bold', child: toNode(content) };
}

/**
 * Wrap content in underline styling
 */
export function underline(content: string | Node): Node {
  return { kind: 'underline', child: toNode(content) };
}

/**
 * Left-align content
 */
export function left(content: string | Node): Node {
  return { kind: 'left', child: toNode(content) };
}

/**
 * Center-align content
 */
export function center(content: string | Node): Node {
  return { kind: 'center', child: toNode(content) };
}

/**
 * Right-align content
 */
export function right(content: string | Node): Node {
  return { kind: 'right', child: toNode(content) };
}

/**
 * Receipt builder for creating printable documents using AST
 *
 * @example
 * const receipt = new Receipt()
 *   .line(bold('Store Name'))
 *   .line(underline('Order #12345'))
 *   .blank()
 *   .table(['Item', 'Price'], [['Coffee', '$3.50']])
 *   .cut();
 *
 * await printer.print(receipt);
 */
export class Receipt {
  private _nodes: Node[] = [];

  /**
   * Add a line (prints content followed by newline)
   */
  line(content: string | Node): this {
    this._nodes.push({ kind: 'line', child: toNode(content) });
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
   * Add a two-column table
   */
  table(headers: [string, string], rows: [string, string][]): this {
    this._nodes.push({ kind: 'table', headers, rows });
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
   * Get all nodes in the receipt
   */
  nodes(): Node[] {
    return this._nodes;
  }
}
