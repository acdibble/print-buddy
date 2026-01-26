import { describe, it, expect } from 'vitest';
import { Receipt, bold, underline } from '../receipt';

describe(Receipt, () => {
  describe('building', () => {
    it('adds line nodes', () => {
      const receipt = new Receipt().line('Hello').line('World');
      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "child": {
              "kind": "text",
              "value": "Hello",
            },
            "kind": "line",
          },
          {
            "child": {
              "kind": "text",
              "value": "World",
            },
            "kind": "line",
          },
        ]
      `);
    });

    it('adds bold wrapped nodes', () => {
      const receipt = new Receipt().line(bold('Hello'));
      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "child": {
              "child": {
                "kind": "text",
                "value": "Hello",
              },
              "kind": "bold",
            },
            "kind": "line",
          },
        ]
      `);
    });

    it('adds underline wrapped nodes', () => {
      const receipt = new Receipt().line(underline('Hello'));
      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "child": {
              "child": {
                "kind": "text",
                "value": "Hello",
              },
              "kind": "underline",
            },
            "kind": "line",
          },
        ]
      `);
    });

    it('supports nested bold and underline', () => {
      const receipt = new Receipt().line(bold(underline('Hello')));
      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "child": {
              "child": {
                "child": {
                  "kind": "text",
                  "value": "Hello",
                },
                "kind": "underline",
              },
              "kind": "bold",
            },
            "kind": "line",
          },
        ]
      `);
    });

    it('adds blank lines with default count', () => {
      const receipt = new Receipt().blank();
      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "count": 1,
            "kind": "blank",
          },
        ]
      `);
    });

    it('adds blank lines with custom count', () => {
      const receipt = new Receipt().blank(3);
      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "count": 3,
            "kind": "blank",
          },
        ]
      `);
    });

    it('adds table nodes', () => {
      const receipt = new Receipt().table(
        ['Item', 'Price'],
        [
          ['Coffee', '$3.50'],
          ['Tea', '$2.50'],
        ],
      );
      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "headers": [
              "Item",
              "Price",
            ],
            "kind": "table",
            "rows": [
              [
                "Coffee",
                "$3.50",
              ],
              [
                "Tea",
                "$2.50",
              ],
            ],
          },
        ]
      `);
    });

    it('adds cut nodes', () => {
      const receipt = new Receipt().cut();
      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "kind": "cut",
          },
        ]
      `);
    });
  });

  describe('chaining', () => {
    it('returns this for fluent API', () => {
      const receipt = new Receipt();

      expect(receipt.line('a')).toBe(receipt);
      expect(receipt.blank()).toBe(receipt);
      expect(receipt.table(['A', 'B'], [])).toBe(receipt);
      expect(receipt.cut()).toBe(receipt);
    });
  });

  describe('complex receipt', () => {
    it('builds a complete receipt', () => {
      const receipt = new Receipt()
        .line(bold('STORE NAME'))
        .line('123 Main St')
        .blank()
        .line(underline('Order #123'))
        .blank()
        .table(['Item', 'Price'], [['Coffee', '$3.50']])
        .blank()
        .line(bold(underline('Total: $3.50')))
        .cut();

      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "child": {
              "child": {
                "kind": "text",
                "value": "STORE NAME",
              },
              "kind": "bold",
            },
            "kind": "line",
          },
          {
            "child": {
              "kind": "text",
              "value": "123 Main St",
            },
            "kind": "line",
          },
          {
            "count": 1,
            "kind": "blank",
          },
          {
            "child": {
              "child": {
                "kind": "text",
                "value": "Order #123",
              },
              "kind": "underline",
            },
            "kind": "line",
          },
          {
            "count": 1,
            "kind": "blank",
          },
          {
            "headers": [
              "Item",
              "Price",
            ],
            "kind": "table",
            "rows": [
              [
                "Coffee",
                "$3.50",
              ],
            ],
          },
          {
            "count": 1,
            "kind": "blank",
          },
          {
            "child": {
              "child": {
                "child": {
                  "kind": "text",
                  "value": "Total: $3.50",
                },
                "kind": "underline",
              },
              "kind": "bold",
            },
            "kind": "line",
          },
          {
            "kind": "cut",
          },
        ]
      `);
    });
  });
});

describe('helper functions', () => {
  it('bold wraps a string with bold', () => {
    expect(bold('test')).toMatchInlineSnapshot(`
      {
        "child": {
          "kind": "text",
          "value": "test",
        },
        "kind": "bold",
      }
    `);
  });

  it('bold wraps a node with bold', () => {
    expect(bold(underline('test'))).toMatchInlineSnapshot(`
      {
        "child": {
          "child": {
            "kind": "text",
            "value": "test",
          },
          "kind": "underline",
        },
        "kind": "bold",
      }
    `);
  });

  it('underline wraps a string with underline', () => {
    expect(underline('test')).toMatchInlineSnapshot(`
      {
        "child": {
          "kind": "text",
          "value": "test",
        },
        "kind": "underline",
      }
    `);
  });

  it('underline wraps a node with underline', () => {
    expect(underline(bold('test'))).toMatchInlineSnapshot(`
      {
        "child": {
          "child": {
            "kind": "text",
            "value": "test",
          },
          "kind": "bold",
        },
        "kind": "underline",
      }
    `);
  });

  it('supports arbitrary nesting', () => {
    expect(bold(underline(bold('deep')))).toMatchInlineSnapshot(`
      {
        "child": {
          "child": {
            "child": {
              "kind": "text",
              "value": "deep",
            },
            "kind": "bold",
          },
          "kind": "underline",
        },
        "kind": "bold",
      }
    `);
  });
});
