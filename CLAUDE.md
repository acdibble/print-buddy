# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

Uses pnpm and Node.js ≥24 (see `.nvmrc`).

```bash
pnpm install                          # Install dependencies
pnpm test                             # Run tests (vitest)
pnpm typecheck                        # Type-check src/ and the tests (tsc)
pnpm lint                             # Lint src/ (oxlint, type-aware)
pnpm format                           # Format everything (oxfmt, also sorts imports)
pnpm build                            # Compile to dist/
pnpm tsx examples/example.ts          # Console output example
pnpm tsx examples/example-usb.ts      # USB printer feature showcase
pnpm tsx examples/example-charset.ts  # CP437 character set on USB printer
pnpm tsx examples/example-image.ts    # Images on the console (--usb for the printer)
./scripts/release.sh <major|minor|patch>  # Bump version, tag, push
```

CI runs typecheck, lint, format check, test and build. The pre-commit hook runs lint-staged (oxlint + oxfmt). `tsconfig.json` only includes `src/` (minus tests), so examples are not type-checked. The tests have their own `src/__tests__/tsconfig.json`, which extends the root one with `noEmit` and is also used by editors.

## Architecture

This is an ESC/POS thermal printer library for TypeScript/Node.js (ESM only).

### Core Modules

**`src/receipt.ts`** - AST-based receipt builder

- Each node type is exported (`TextNode`, `BoldNode`, ...); `InlineNode` and `BlockNode` group them, and `Node` is their union
- Block nodes: `line`, `image`, `blank`, `feed`, `cut`, `partialCut`, plus `LayoutNode`s (`paragraph`, `rule`, `pair`, `table`) laid out by `layout.ts`
- Inline nodes (per-character styles, nest freely): `bold`, `underline` (`'normal' | 'thick'`), `fontB`, `span` (siblings); leaf: `text`
- `Content` (`string | InlineNode | Content[]`) is what helpers and `line()` accept; `toNode` turns strings into `text` and arrays into `span`
- Line-level settings are `LineOptions` on `line(content, { align, flip })`, stored on `LineNode`. The printer applies alignment and upside-down mode when the line prints, so they must not be modelled as inline nodes
- `Receipt` class with fluent API that appends nodes to a flat list; `append`, `each` and `when` compose receipts without breaking the chain; `nodes()` returns a copy
- Helper functions accept `string | Node` and wrap strings in a `TextNode`

**`src/connections/printer-connection.ts`** - Abstract visitor base

- `print(receipt)` calls `reset()`, visits each node, then calls `reset()` again
- `visit()` dispatches on `node.kind` to an abstract `visitXxx` method per node type
- `width` is the Font A column count, passed to `layout()`
- `dotsPerLine` is `width × 12` (Font A is 12 dots wide). `image` nodes are rasterized to fit it and handed to `visitRaster` as a `RasterNode`
- Owns inline styling: `bold`/`underline`/`fontB` go through `withStyle`, which tracks the active `TextStyle` and restores the previous style afterwards (so outer styles survive nested ones). Connections implement only `applyStyle(next, previous)`

**`src/connections/escpos-connection.ts`** - Shared ESC/POS output

- `EscPosConnection` implements every visitor by emitting ESC/POS commands from `src/command.ts`; text encoded as CP437 via `iconv-lite`
- `applyStyle` sends only the commands for styles that changed; `visitLine` sets alignment/flip before the content and resets them after the line feed
- `visitRaster` prints images with `GS v 0` in bands of up to 256 rows, aligned with `ESC a`
- Subclasses only implement the transport: `write(bytes)` and `close()`

**`src/connections/usb-connection.ts`** - USB transport (`EscPosConnection` subclass)

- Uses the `usb` package; auto-detects the bulk OUT endpoint on interface 0

**`src/connections/network-connection.ts`** - Raw TCP transport, port 9100 by default (`EscPosConnection` subclass)

- `write` collects the job's bytes in memory, then `print` opens a socket, sends them in one write and closes it. Each job gets its own connection
- Jobs are queued so concurrent `print` calls don't interleave; `close()` waits for the queue to drain
- Failures reject with `NetworkError`. An idle timeout after all bytes were flushed counts as success, because the peer might never close its side

**`src/connections/console-connection.ts`** - ANSI terminal output

- Bold/underline via ANSI codes (`applyStyle` resets and re-enables when a style ends); `visitLine` aligns with space padding
- Font B and `flip` are ignored, and their content prints as plain text
- Images are drawn with quadrant block characters (`renderBlocks`), one character per 12×24 dot cell

**`src/layout.ts`** - Width-dependent layout

- `layout(node, width)` turns `LayoutNode`s (`paragraph`, `rule`, `pair`, `table`) into plain `LineNode`s at print time, keeping inline styles (`wrap` and `slice` work on styled trees)
- The base connection calls it, so connections don't implement visitors for these nodes
- Widths are counted in characters (Font A columns); Font B inside layouts isn't measured exactly

**`src/image.ts`** - Image processing

- `toGrayscale` turns `RawImage` pixels (1–4 channels, inferred from the data length) into grayscale over white; `Receipt.image()` calls it, so `ImageNode` holds grayscale
- `rasterize(node, maxWidth)` runs at print time: area-average resampling to the requested width (never wider than the paper), then Floyd–Steinberg or threshold into a packed 1-bit `Bitmap` (MSB = leftmost dot, set bit = black)
- No image decoding: callers pass pixels from sharp, pngjs, `ImageData`, etc.

**`src/printer.ts`** - Main printer interface

- `Printer.create(profile)` builds the connection; throws `PrinterNotFoundError` if the USB device isn't found (network profiles don't connect until a job prints)
- Delegates `print(receipt)` and `close()` to the connection; `close()` only closes the connection once
- Implements `AsyncDisposable` (`Symbol.asyncDispose` calls `close()`), so `await using printer = await Printer.create(...)` works; the examples use it

**`src/printer-profile.ts`** - Configuration

- `createUsbProfile(options)`: `vendorId`, `productId`, optional `endpoint`/`timeout`, required `columnsPerFont: { FontA, FontB }`
- `createNetworkProfile(options)`: `host`, optional `port` (9100) / `timeout` (5000ms), required `columnsPerFont`
- `createConsoleProfile()`: no options, 48 columns

**`src/printer-model.ts`** - Printer presets

- `getUsbProfile(model, paperWidth = '80mm')` and `getNetworkProfile(model, { host, port?, timeout? }, paperWidth = '80mm')`; only model is `TMT20III`
- Column counts per paper width: 80mm → FontA 48 / FontB 64, 58mm → FontA 35 / FontB 46 (so 576 / 420 dots)

**`src/command.ts`** / **`src/errors.ts`** - ESC/POS byte constants and error classes (`EscposError` base, `PrinterNotFoundError`, `UsbError`, `NoBulkEndpointError`, `NetworkError`), all exported from `src/index.ts`

### Testing

- `src/__tests__/helpers/virtual-printer.ts` interprets the ESC/POS bytes and renders the paper as text (alignment, wrapping, styles, cuts, `GS v 0` images as block characters; back-to-back bands merge). Prefer it over raw byte snapshots when checking what prints. It throws on unknown commands, so new commands need adding there
- `src/__tests__/helpers/usb-mock.ts` records bytes; use it with `vi.mock('usb', async () => (await import('./helpers/usb-mock.js')).createUsbModule())`
- `network-connection.test.ts` runs a local TCP server as a fake printer and checks the bytes match the USB connection's
- `console-connection.test.ts` captures stdout and replaces ANSI codes with readable tags
- Tests are excluded from the root `tsconfig.json` (so they aren't built) and from oxlint (`ignorePatterns` in `.oxlintrc.json`). `src/__tests__/tsconfig.json` type-checks them, so test imports need `.js` extensions like the source

### Adding a Node Type

1. Add the node type to the `InlineNode` or `BlockNode` union (plus a helper or `Receipt` method) in `receipt.ts`
2. Add a `case` in `PrinterConnection.visit()` and an abstract `visitXxx`, then implement it in both `EscPosConnection` and `ConsoleConnection`
3. Exceptions: a node that can be expressed as lines is a `LayoutNode` handled in `layout.ts` (no visitors). A new character style is a `TextStyle` field plus a `withStyle` case. Inline nodes also need `textOf` and `slice` in `layout.ts`
4. Export it from `src/index.ts` and add tests (USB tests are byte-stream snapshots with `usb` mocked)

### Key Patterns

- **AST + Visitor**: Receipt is an AST of nodes; connections implement visitors
- **Composable styling**: `bold(underline('Hello'))` for nested formatting, arrays for mixed styles: `['Total: ', bold('$5')]`
- **Factory functions**: Simple `createXxxProfile()` instead of builders
