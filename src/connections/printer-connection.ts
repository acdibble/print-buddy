import { Formatter } from '../formatter.js';
import { Node, Receipt } from '../receipt.js';

/**
 * Abstract base class for printer connections with visitor pattern
 *
 * All connection types (USB, Console, Network) extend this class
 * and implement the visit methods for each node type.
 */
export abstract class PrinterConnection {
  protected width: number = 32;
  protected formatter: Formatter;

  constructor(width: number = 32) {
    this.width = width;
    this.formatter = new Formatter(width);
  }

  /**
   * Print a receipt by visiting each node
   */
  async print(receipt: Receipt): Promise<void> {
    await this.reset();
    for (const node of receipt.nodes()) {
      await this.visit(node);
    }
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
        await this.visitText(node.value);
        break;
      case 'bold':
        await this.visitBold(node.child);
        break;
      case 'underline':
        await this.visitUnderline(node.child);
        break;
      case 'left':
        await this.visitLeft(node.child);
        break;
      case 'center':
        await this.visitCenter(node.child);
        break;
      case 'right':
        await this.visitRight(node.child);
        break;
      case 'line':
        await this.visitLine(node.child);
        break;
      case 'blank':
        await this.visitBlank(node.count);
        break;
      case 'table':
        await this.visitTable(node.headers, node.rows);
        break;
      case 'feed':
        await this.visitFeed();
        break;
      case 'cut':
        await this.visitCut();
        break;
      case 'partialCut':
        await this.visitPartialCut();
        break;
    }
  }

  protected abstract visitText(value: string): Promise<void>;
  protected abstract visitBold(child: Node): Promise<void>;
  protected abstract visitUnderline(child: Node): Promise<void>;
  protected abstract visitLeft(child: Node): Promise<void>;
  protected abstract visitCenter(child: Node): Promise<void>;
  protected abstract visitRight(child: Node): Promise<void>;
  protected abstract visitLine(child: Node): Promise<void>;
  protected abstract visitBlank(count: number): Promise<void>;
  protected abstract visitTable(headers: [string, string], rows: [string, string][]): Promise<void>;
  protected abstract visitFeed(): Promise<void>;
  protected abstract visitCut(): Promise<void>;
  protected abstract visitPartialCut(): Promise<void>;

  /**
   * Close the connection
   */
  abstract close(): Promise<void>;
}
