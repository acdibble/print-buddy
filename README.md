# print-buddy

ESC/POS thermal printer library for Node.js with a composable, AST-based API.

## Installation

```bash
pnpm add print-buddy
```

Requires Node.js 24 or later.

## Quick Start

```typescript
import { Printer, createConsoleProfile, Receipt, bold, underline } from 'print-buddy';

await using printer = await Printer.create(createConsoleProfile());

const receipt = new Receipt()
  .line(bold('COFFEE SHOP'), { align: 'center' })
  .line('123 Main Street', { align: 'center' })
  .rule('=')
  .line(['Order ', underline('#12345')])
  .table({
    header: ['Item', 'Qty', 'Price'],
    rows: [
      ['Latte', '1', '$4.50'],
      ['Croissant', '1', '$3.25'],
    ],
  })
  .rule()
  .pair(bold('Total'), bold('$7.75'))
  .blank()
  .paragraph('Thank you! Returns accepted within 30 days with a receipt.', { align: 'center' })
  .cut();

await printer.print(receipt);
```

`Printer` is async disposable, so `await using` closes it when the enclosing block exits, even if printing throws. You can also call `await printer.close()` yourself; closing more than once does nothing.

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

## Network Printer

Network receipt printers take raw ESC/POS bytes over TCP, usually on port 9100. `NetworkConnection` sends the same bytes as the USB connection.

```typescript
import { Printer, createNetworkProfile, getNetworkProfile } from 'print-buddy';

// Use a preset printer model
const printer = await Printer.create(getNetworkProfile('TMT20III', { host: '192.168.1.50' }));

// Or configure manually
const printer = await Printer.create(
  createNetworkProfile({
    host: 'printer.local',
    port: 9100,
    columnsPerFont: { FontA: 48, FontB: 64 },
  }),
);
```

Every print job opens a new connection and closes it when the job is done. A long-running server doesn't hold the printer between jobs, and if the printer is offline, only that job fails and the next one tries again. Jobs sent to the same printer go one at a time. A job that fails rejects with a `NetworkError`.

The error classes are exported: `EscposError` is the base class, and `UsbError`, `NoBulkEndpointError`, `NetworkError` and `UnsupportedFontError` extend it.

### Exposing a USB printer to the network

A USB printer connected to a Linux machine such as a Raspberry Pi can be shared on port 9100. Linux's `usblp` driver exposes the printer as `/dev/usb/lp0`, and `socat` forwards each connection to it:

```bash
sudo apt install socat
socat TCP-LISTEN:9100,fork,reuseaddr OPEN:/dev/usb/lp0,wronly
```

To keep it running, make it a systemd service. Port 9100 has no authentication or encryption, so keep it on a trusted network or reach it over a VPN such as WireGuard or Tailscale.

## API

### Receipt Builder

```typescript
const receipt = new Receipt()
  .line(content, options?)        // Print content followed by a newline
  .paragraph(content, options?)   // Word-wrap content to the paper width
  .rule(pattern?)                 // Fill a line with a pattern (default: '-')
  .pair(left, right, { fill? })   // Content at both edges, e.g. a label and a price
  .table({ columns?, header?, rows, divider? })  // Table sized to the paper width
  .blank(count?)                  // Print blank lines (default: 1)
  .feed()                         // Feed paper (no cut)
  .cut()                          // Full paper cut
  .partialCut();                  // Partial paper cut
```

`content` is a string, a styled node, or an array of them. `options` sets line-level settings; see [Line Options](#line-options).

### Layout

`paragraph`, `rule`, `pair` and `table` are laid out when the receipt prints, so they fit whatever paper width the printer has.

```typescript
receipt
  .rule('=') // A full-width line of '='
  .pair('Subtotal', '$9.00') // Label at the left edge, amount at the right
  .pair('Tip', '$1.50', { fill: '.' }) // Same, with dot leaders: "Tip ....... $1.50"
  .table({
    columns: [{}, { align: 'center' }, { width: 8 }],
    header: [bold('Item'), bold('Qty'), bold('Price')],
    rows: [
      ['Espresso', '2', '$8.00'],
      [underline('Croissant'), '1', '$3.50'],
    ],
  });
```

- **`pair`** moves the right side onto the next line if both sides don't fit on one.
- **`table`** has as many columns as its widest row. The first column is left-aligned and the rest are right-aligned unless `columns` says otherwise. Columns without a fixed `width` fit their content; the first of them takes any spare room, and the widest shrinks if the table is too wide. Cells that don't fit wrap onto extra lines. The header is underlined with `divider` (default `'-'`; `false` for none).
- **`paragraph`** breaks lines at spaces, and mid-word only for words longer than a line.

Widths are counted in characters, so Font B content inside a `pair` or `table` takes less room than counted and won't line up exactly.

### Styling

Styles are composable. Pass a string, or wrap another node to combine styles:

```typescript
'Hello'; // Plain text
bold('Hello'); // Bold
underline('Hello'); // 1-dot underline
underline('Hello', 'thick'); // 2-dot underline
fontB('Hello'); // Font B (narrower, more columns per line)
bold(underline('Hello')); // Bold + underlined
```

Use an array to mix styles on one line. Arrays work anywhere content does, including inside styles:

```typescript
receipt.line(['Total: ', bold('$5.50')]).line(bold(['Order ', underline('#123'), ' paid']));
```

### Line Options

Alignment and upside-down printing apply to a whole line, so they're options on `line()` rather than styles:

```typescript
receipt
  .line('Hello', { align: 'center' }) // 'left' (default), 'center' or 'right'
  .line(bold('Total: $9.00'), { align: 'right' })
  .line('Hello', { flip: true }); // Upside-down (180° rotation)
```

Each option applies only to its own line.

### Composing Receipts

Build receipts from reusable parts, and add loops and conditions without breaking the chain:

```typescript
const footer = new Receipt().rule().line('Thank you!', { align: 'center' });

const receipt = new Receipt()
  .line(bold('COFFEE SHOP'), { align: 'center' })
  .each(order.items, (r, item) => r.pair(item.name, item.price))
  .when(order.tip, (r) => r.pair('Tip', order.tip))
  .append(footer)
  .cut();
```

- **`append(...receipts)`** copies in the other receipts' contents as they are at that moment.
- **`each(items, fn)`** calls `fn(receipt, item, index)` for every item in any iterable.
- **`when(condition, fn)`** calls `fn(receipt)` only if `condition` is truthy.

`receipt.nodes()` returns a copy of the receipt's nodes, so changing the array doesn't change the receipt.

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

// Network printer (raw TCP)
createNetworkProfile({
  host: string,
  port?: number,       // default: 9100
  timeout?: number,    // idle timeout per job; default: 5000ms
  columnsPerFont: { FontA: number, FontB: number },
})

// Preset profiles for a known model
getUsbProfile('TMT20III', '80mm')  // or '58mm'; default: '80mm'
getNetworkProfile('TMT20III', { host, port?, timeout? }, '80mm')
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
