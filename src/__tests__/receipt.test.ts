import { describe, it, expect } from 'vitest';

import { Receipt, bold, underline } from '../receipt';

describe(Receipt, () => {
  describe('building', () => {
    it('adds line nodes', () => {
      const receipt = new Receipt().line('Hello').line('World');
      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "align": "left",
            "child": {
              "kind": "text",
              "value": "Hello",
            },
            "flip": false,
            "kind": "line",
          },
          {
            "align": "left",
            "child": {
              "kind": "text",
              "value": "World",
            },
            "flip": false,
            "kind": "line",
          },
        ]
      `);
    });

    it('sets line options', () => {
      const receipt = new Receipt()
        .line('Centered', { align: 'center' })
        .line('Flipped right', { align: 'right', flip: true });
      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "align": "center",
            "child": {
              "kind": "text",
              "value": "Centered",
            },
            "flip": false,
            "kind": "line",
          },
          {
            "align": "right",
            "child": {
              "kind": "text",
              "value": "Flipped right",
            },
            "flip": true,
            "kind": "line",
          },
        ]
      `);
    });

    it('accepts arrays of mixed content', () => {
      const receipt = new Receipt().line(['Total: ', bold(['$', underline('5.50')])]);
      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "align": "left",
            "child": {
              "children": [
                {
                  "kind": "text",
                  "value": "Total: ",
                },
                {
                  "child": {
                    "children": [
                      {
                        "kind": "text",
                        "value": "$",
                      },
                      {
                        "child": {
                          "kind": "text",
                          "value": "5.50",
                        },
                        "kind": "underline",
                        "type": "normal",
                      },
                    ],
                    "kind": "span",
                  },
                  "kind": "bold",
                },
              ],
              "kind": "span",
            },
            "flip": false,
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
            "align": "left",
            "child": {
              "child": {
                "kind": "text",
                "value": "Hello",
              },
              "kind": "bold",
            },
            "flip": false,
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
            "align": "left",
            "child": {
              "child": {
                "kind": "text",
                "value": "Hello",
              },
              "kind": "underline",
              "type": "normal",
            },
            "flip": false,
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
            "align": "left",
            "child": {
              "child": {
                "child": {
                  "kind": "text",
                  "value": "Hello",
                },
                "kind": "underline",
                "type": "normal",
              },
              "kind": "bold",
            },
            "flip": false,
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
      const receipt = new Receipt().table({
        header: ['Item', 'Price'],
        rows: [
          ['Coffee', '$3.50'],
          ['Tea', '$2.50'],
        ],
      });
      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "columns": [
              {
                "align": "left",
                "width": null,
              },
              {
                "align": "right",
                "width": null,
              },
            ],
            "divider": "-",
            "header": [
              {
                "kind": "text",
                "value": "Item",
              },
              {
                "kind": "text",
                "value": "Price",
              },
            ],
            "kind": "table",
            "rows": [
              [
                {
                  "kind": "text",
                  "value": "Coffee",
                },
                {
                  "kind": "text",
                  "value": "$3.50",
                },
              ],
              [
                {
                  "kind": "text",
                  "value": "Tea",
                },
                {
                  "kind": "text",
                  "value": "$2.50",
                },
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
      expect(receipt.table({ header: ['A', 'B'], rows: [] })).toBe(receipt);
      expect(receipt.cut()).toBe(receipt);
      expect(receipt.append(new Receipt())).toBe(receipt);
      expect(receipt.each([], () => {})).toBe(receipt);
      expect(receipt.when(false, () => {})).toBe(receipt);
    });
  });

  describe('composition', () => {
    /** Summarise a receipt as line text, or the node kind for other nodes */
    const summary = (receipt: Receipt) =>
      receipt
        .nodes()
        .map((node) =>
          node.kind === 'line' && node.child.kind === 'text' ? node.child.value : node.kind,
        );

    it('appends other receipts', () => {
      const header = new Receipt().line('Header');
      const footer = new Receipt().rule().line('Footer');
      const receipt = new Receipt().append(header).line('Body').append(footer, header);

      expect(summary(receipt)).toEqual(['Header', 'Body', 'rule', 'Footer', 'Header']);
    });

    it('copies appended nodes rather than linking receipts', () => {
      const header = new Receipt().line('Header');
      const receipt = new Receipt().append(header);
      header.line('Added later');

      expect(summary(receipt)).toEqual(['Header']);
    });

    it('can append itself', () => {
      const receipt = new Receipt().line('a');
      receipt.append(receipt);

      expect(summary(receipt)).toEqual(['a', 'a']);
    });

    it('adds content for each item, with its index', () => {
      const items = ['Coffee', 'Muffin'];
      const receipt = new Receipt().each(items, (r, item, i) =>
        r.line(`${String(i + 1)}. ${item}`),
      );

      expect(summary(receipt)).toEqual(['1. Coffee', '2. Muffin']);
    });

    it('accepts any iterable in each', () => {
      const receipt = new Receipt().each(new Set(['a', 'b']), (r, item) => r.line(item));

      expect(summary(receipt)).toEqual(['a', 'b']);
    });

    it('adds content only when the condition holds', () => {
      const receipt = new Receipt()
        .when(true, (r) => r.line('shown'))
        .when(0, (r) => r.line('hidden'))
        .when('', (r) => r.line('hidden'));

      expect(summary(receipt)).toEqual(['shown']);
    });

    it('returns a copy of its nodes', () => {
      const receipt = new Receipt().line('a');
      (receipt.nodes() as unknown[]).push('junk');

      expect(receipt.nodes()).toHaveLength(1);
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
        .table({ header: ['Item', 'Price'], rows: [['Coffee', '$3.50']] })
        .blank()
        .line(bold(underline('Total: $3.50')))
        .cut();

      expect(receipt.nodes()).toMatchInlineSnapshot(`
        [
          {
            "align": "left",
            "child": {
              "child": {
                "kind": "text",
                "value": "STORE NAME",
              },
              "kind": "bold",
            },
            "flip": false,
            "kind": "line",
          },
          {
            "align": "left",
            "child": {
              "kind": "text",
              "value": "123 Main St",
            },
            "flip": false,
            "kind": "line",
          },
          {
            "count": 1,
            "kind": "blank",
          },
          {
            "align": "left",
            "child": {
              "child": {
                "kind": "text",
                "value": "Order #123",
              },
              "kind": "underline",
              "type": "normal",
            },
            "flip": false,
            "kind": "line",
          },
          {
            "count": 1,
            "kind": "blank",
          },
          {
            "columns": [
              {
                "align": "left",
                "width": null,
              },
              {
                "align": "right",
                "width": null,
              },
            ],
            "divider": "-",
            "header": [
              {
                "kind": "text",
                "value": "Item",
              },
              {
                "kind": "text",
                "value": "Price",
              },
            ],
            "kind": "table",
            "rows": [
              [
                {
                  "kind": "text",
                  "value": "Coffee",
                },
                {
                  "kind": "text",
                  "value": "$3.50",
                },
              ],
            ],
          },
          {
            "count": 1,
            "kind": "blank",
          },
          {
            "align": "left",
            "child": {
              "child": {
                "child": {
                  "kind": "text",
                  "value": "Total: $3.50",
                },
                "kind": "underline",
                "type": "normal",
              },
              "kind": "bold",
            },
            "flip": false,
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
          "type": "normal",
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
        "type": "normal",
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
        "type": "normal",
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
          "type": "normal",
        },
        "kind": "bold",
      }
    `);
  });
});
