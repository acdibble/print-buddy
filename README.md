# print-buddy

ESC/POS thermal printer library for Node.js with a composable, AST-based API.

## Installation

```bash
pnpm add print-buddy
```

## Quick Start

```typescript
import { Printer, createConsoleProfile, Receipt, text, bold, underline } from 'print-buddy';

const printer = await Printer.create(createConsoleProfile());

const receipt = new Receipt()
  .line(bold(text('COFFEE SHOP')))
  .line(text('123 Main Street'))
  .blank()
  .line(underline(text('Order #12345')))
  .blank()
  .table(['Item', 'Price'], [
    ['Latte', '$4.50'],
    ['Croissant', '$3.25'],
  ])
  .blank()
  .line(bold(underline(text('Total: $7.75'))))
  .blank()
  .line(text('Thank you!'))
  .cut();

await printer.print(receipt);
await printer.close();
```

## USB Printer

```typescript
import { Printer, getUsbProfile, Receipt, text, bold } from 'print-buddy';

// Use a preset printer model
const printer = await Printer.create(getUsbProfile('TMT20III'));

// Or configure manually
import { createUsbProfile } from 'print-buddy';

const printer = await Printer.create(createUsbProfile({
  vendorId: 0x04b8,
  productId: 0x0e28,
  width: 576,  // 80mm paper
}));
```

## API

### Receipt Builder

```typescript
const receipt = new Receipt()
  .line(node)        // Print node followed by newline
  .blank(count?)     // Print blank lines (default: 1)
  .table(headers, rows)  // Two-column table
  .feed()            // Feed paper (no cut)
  .cut()             // Full paper cut
  .partialCut();     // Partial paper cut
```

### Text Nodes

Nodes are composable - wrap them to combine styles:

```typescript
text('Hello')                      // Plain text
bold(text('Hello'))                // Bold text
underline(text('Hello'))           // Underlined text
bold(underline(text('Hello')))     // Bold + underlined
```

### Printer Profiles

```typescript
// Console output (for testing)
createConsoleProfile({ fontColumns?: number, width?: number })

// USB printer
createUsbProfile({
  vendorId: number,
  productId: number,
  endpoint?: number,
  timeout?: number,    // default: 2000ms
  fontColumns?: number, // default: 48
  width?: number,       // default: 576
})

// Preset profiles
getUsbProfile('TMT20III', '80mm')  // or '58mm'
```

### Paper Widths

| Paper Size | Width (dots) |
|------------|--------------|
| 80mm       | 576          |
| 58mm       | 384          |

## License

MIT
