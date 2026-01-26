import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Receipt, text, bold, underline, Node } from '../receipt';

describe(Receipt, () => {
  describe('building', () => {
    it('adds line nodes', () => {
      const receipt = new Receipt().line(text('Hello')).line(text('World'));

      const nodes = receipt.nodes();
      expect(nodes).toHaveLength(2);
      expect(nodes[0]).toEqual({ kind: 'line', child: { kind: 'text', value: 'Hello' } });
      expect(nodes[1]).toEqual({ kind: 'line', child: { kind: 'text', value: 'World' } });
    });

    it('adds bold wrapped nodes', () => {
      const receipt = new Receipt().line(bold(text('Hello')));

      const nodes = receipt.nodes();
      expect(nodes[0]).toEqual({
        kind: 'line',
        child: { kind: 'bold', child: { kind: 'text', value: 'Hello' } },
      });
    });

    it('adds underline wrapped nodes', () => {
      const receipt = new Receipt().line(underline(text('Hello')));

      const nodes = receipt.nodes();
      expect(nodes[0]).toEqual({
        kind: 'line',
        child: { kind: 'underline', child: { kind: 'text', value: 'Hello' } },
      });
    });

    it('supports nested bold and underline', () => {
      const receipt = new Receipt().line(bold(underline(text('Hello'))));

      const nodes = receipt.nodes();
      expect(nodes[0]).toEqual({
        kind: 'line',
        child: {
          kind: 'bold',
          child: { kind: 'underline', child: { kind: 'text', value: 'Hello' } },
        },
      });
    });

    it('adds blank lines with default count', () => {
      const receipt = new Receipt().blank();

      const nodes = receipt.nodes();
      expect(nodes[0]).toEqual({ kind: 'blank', count: 1 });
    });

    it('adds blank lines with custom count', () => {
      const receipt = new Receipt().blank(3);

      const nodes = receipt.nodes();
      expect(nodes[0]).toEqual({ kind: 'blank', count: 3 });
    });

    it('adds table nodes', () => {
      const receipt = new Receipt().table(
        ['Item', 'Price'],
        [
          ['Coffee', '$3.50'],
          ['Tea', '$2.50'],
        ],
      );

      const nodes = receipt.nodes();
      expect(nodes[0]).toEqual({
        kind: 'table',
        headers: ['Item', 'Price'],
        rows: [
          ['Coffee', '$3.50'],
          ['Tea', '$2.50'],
        ],
      });
    });

    it('adds cut nodes', () => {
      const receipt = new Receipt().cut();

      const nodes = receipt.nodes();
      expect(nodes[0]).toEqual({ kind: 'cut' });
    });
  });

  describe('chaining', () => {
    it('returns this for fluent API', () => {
      const receipt = new Receipt();

      expect(receipt.line(text('a'))).toBe(receipt);
      expect(receipt.blank()).toBe(receipt);
      expect(receipt.table(['A', 'B'], [])).toBe(receipt);
      expect(receipt.cut()).toBe(receipt);
    });
  });

  describe('complex receipt', () => {
    it('builds a complete receipt', () => {
      const receipt = new Receipt()
        .line(bold(text('STORE NAME')))
        .line(text('123 Main St'))
        .blank()
        .line(underline(text('Order #123')))
        .blank()
        .table(['Item', 'Price'], [['Coffee', '$3.50']])
        .blank()
        .line(bold(underline(text('Total: $3.50'))))
        .cut();

      const nodes = receipt.nodes();
      expect(nodes).toHaveLength(9);
      expect(nodes[0].kind).toBe('line');
      expect(nodes[1].kind).toBe('line');
      expect(nodes[2].kind).toBe('blank');
      expect(nodes[3].kind).toBe('line');
      expect(nodes[4].kind).toBe('blank');
      expect(nodes[5].kind).toBe('table');
      expect(nodes[6].kind).toBe('blank');
      expect(nodes[7].kind).toBe('line');
      expect(nodes[8].kind).toBe('cut');
    });
  });
});

describe('helper functions', () => {
  it('text creates a text node', () => {
    const result = text('test');
    expect(result).toEqual({ kind: 'text', value: 'test' });
  });

  it('bold wraps a node with bold', () => {
    const inner = text('test');
    const result = bold(inner);
    expect(result).toEqual({ kind: 'bold', child: inner });
  });

  it('underline wraps a node with underline', () => {
    const inner = text('test');
    const result = underline(inner);
    expect(result).toEqual({ kind: 'underline', child: inner });
  });

  it('supports arbitrary nesting', () => {
    const result = bold(underline(bold(text('deep'))));
    expect(result).toEqual({
      kind: 'bold',
      child: {
        kind: 'underline',
        child: {
          kind: 'bold',
          child: { kind: 'text', value: 'deep' },
        },
      },
    });
  });
});
