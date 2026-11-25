import { layout } from '../layout.js';
import {
  BlankNode,
  CutNode,
  FeedNode,
  InlineNode,
  LineNode,
  Node,
  PartialCutNode,
  Receipt,
  TextNode,
} from '../receipt.js';

/**
 * Character styles that can be active at once
 */
export interface TextStyle {
  readonly bold: boolean;
  readonly underline: 'none' | 'normal' | 'thick';
  readonly fontB: boolean;
}

const DEFAULT_STYLE: TextStyle = { bold: false, underline: 'none', fontB: false };

/**
 * Abstract base class for printer connections with visitor pattern
 *
 * All connection types (USB, Console, Network) extend this class
 * and implement the visit methods for each node type.
 */
export abstract class PrinterConnection {
  protected width: number = 32;

  /** Character style currently in effect on the output */
  protected style: TextStyle = DEFAULT_STYLE;

  constructor(width: number = 32) {
    this.width = width;
  }

  /**
   * Print a receipt by visiting each node
   */
  async print(receipt: Receipt): Promise<void> {
    this.style = DEFAULT_STYLE;
    await this.reset();
    for (const node of receipt.nodes()) {
      await this.visit(node);
    }
    this.style = DEFAULT_STYLE;
    await this.reset();
  }

  /**
   * Reset printer to default state
   */
  protected abstract reset(): Promise<void>;

  /**
   * Visit a node and dispatch to the appropriate handler
   */
  protected async visit(node: Node): Promise<void> {
    switch (node.kind) {
      case 'text':
        await this.visitText(node);
        break;
      case 'bold':
        await this.withStyle({ bold: true }, node.child);
        break;
      case 'underline':
        await this.withStyle({ underline: node.type }, node.child);
        break;
      case 'fontB':
        await this.withStyle({ fontB: true }, node.child);
        break;
      case 'span':
        for (const child of node.children) await this.visit(child);
        break;
      case 'line':
        await this.visitLine(node);
        break;
      case 'blank':
        await this.visitBlank(node);
        break;
      case 'paragraph':
      case 'rule':
      case 'pair':
      case 'table':
        for (const line of layout(node, this.width)) await this.visitLine(line);
        break;
      case 'feed':
        await this.visitFeed(node);
        break;
      case 'cut':
        await this.visitCut(node);
        break;
      case 'partialCut':
        await this.visitPartialCut(node);
        break;
    }
  }

  /**
   * Render a child with extra styling, then restore exactly the style that
   * was in effect before. Restoring (rather than switching the style off)
   * keeps outer styles intact, e.g. the "c" in bold(['a', bold('b'), 'c']).
   */
  private async withStyle(patch: Partial<TextStyle>, child: InlineNode): Promise<void> {
    const previous = this.style;
    await this.changeStyle({ ...previous, ...patch });
    await this.visit(child);
    await this.changeStyle(previous);
  }

  private async changeStyle(next: TextStyle): Promise<void> {
    const previous = this.style;
    if (
      next.bold === previous.bold &&
      next.underline === previous.underline &&
      next.fontB === previous.fontB
    ) {
      return;
    }
    this.style = next;
    await this.applyStyle(next, previous);
  }

  /**
   * Switch the output from one character style to another
   */
  protected abstract applyStyle(next: TextStyle, previous: TextStyle): Promise<void>;

  protected abstract visitText(node: TextNode): Promise<void>;
  protected abstract visitLine(node: LineNode): Promise<void>;
  protected abstract visitBlank(node: BlankNode): Promise<void>;
  protected abstract visitFeed(node: FeedNode): Promise<void>;
  protected abstract visitCut(node: CutNode): Promise<void>;
  protected abstract visitPartialCut(node: PartialCutNode): Promise<void>;

  /**
   * Close the connection
   */
  abstract close(): Promise<void>;
}
