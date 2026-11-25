# print-buddy

ESC/POS thermal printer library for Node.js with a composable, AST-based API.

## Installation

```bash
pnpm add print-buddy
```

Requires Node.js 24 or later.

## Quick Start

```typescript
import { Printer, createConsoleProfile, Receipt, bold, center, underline } from 'print-buddy';

const printer = await Printer.create(createConsoleProfile());

const receipt = new Receipt()
  .line(center(bold('COFFEE SHOP')))
  .line(center('123 Main Street'))
  .blank()
  .line(underline('Order #12345'))
  .blank()
  .table(
    ['Item', 'Price'],
    [
      ['Latte', '$4.50'],
      ['Croissant', '$3.25'],
    ],
  )
  .blank()
  .line(bold(underline('Total: $7.75')))
  .blank()
  .line('Thank you!')
  .cut();

await printer.print(receipt);
await printer.close();
```

## USB Printer

```typescript
import { Printer, createUsbProfile, getUsbProfile } from 'print-buddy';

// Use a preset printer model
const printer = await Printer.create(getUsbProfile('TMT20III', '80mm'));

// Or configure manually
const printer = await Printer.create(
  createUsbProfile({
    vendorId: 0x04b8,
    productId: 0x0e28,
    columnsPerFont: { FontA: 48, FontB: 64 },
  }),
);

if (!printer) {
  throw new Error('Printer not found');
}
```

`Printer.create` returns `null` if no USB device matches the vendor and product IDs. Text is encoded as CP437.

## API

### Receipt Builder

```typescript
const receipt = new Receipt()
  .line(content)         // Print content followed by a newline
  .blank(count?)         // Print blank lines (default: 1)
  .table(headers, rows)  // Two-column table: [string, string] headers and rows
  .feed()                // Feed paper (no cut)
  .cut()                 // Full paper cut
  .partialCut();         // Partial paper cut
```

`content` is a string or a styled node.

### Styling

Styles are composable. Pass a string, or wrap another node to combine styles:

```typescript
'Hello'; // Plain text
bold('Hello'); // Bold
underline('Hello'); // 1-dot underline
underline('Hello', 'thick'); // 2-dot underline
fontB('Hello'); // Font B (narrower, more columns per line)
flip('Hello'); // Upside-down (180° rotation)
bold(underline('Hello')); // Bold + underlined
```

### Alignment

```typescript
left('Hello');
center('Hello');
right(bold('Total: $9.00'));
```

Alignment applies to the line it appears in. Each `line()` returns to left alignment afterwards.

### Printer Profiles

```typescript
// Console output with ANSI styling (for testing without hardware)
createConsoleProfile()

// USB printer
createUsbProfile({
  vendorId: number,
  productId: number,
  endpoint?: number,   // bulk OUT endpoint; auto-detected if omitted
  timeout?: number,    // default: 2000ms
  columnsPerFont: { FontA: number, FontB: number },
})

// Preset profile for a known model
getUsbProfile('TMT20III', '80mm')  // or '58mm'; default: '80mm'
```

The console output does not show Font B or upside-down text. It prints that content as plain text.

### Supported Models

| Model           | Paper | Font A columns | Font B columns |
| --------------- | ----- | -------------- | -------------- |
| Epson TM-T20III | 80mm  | 48             | 64             |
| Epson TM-T20III | 58mm  | 35             | 46             |

## Examples

```bash
pnpm tsx examples/example.ts          # Console output
pnpm tsx examples/example-usb.ts      # Feature showcase on a USB printer
pnpm tsx examples/example-charset.ts  # CP437 character set on a USB printer
```

## License

MIT
