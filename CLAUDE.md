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
pnpm tsx scripts/probe-status.ts      # Log a TM-T20III's status replies (USB, or --host; --interactive)
./scripts/release.sh <major|minor|patch>  # Bump version, tag, push
```

CI runs typecheck, lint, format check, test and build. The pre-commit hook runs lint-staged (oxlint + oxfmt). `tsconfig.json` only includes `src/` (minus tests), so examples and scripts are not type-checked (oxlint skips them too). The tests have their own `src/__tests__/tsconfig.json`, which extends the root one with `noEmit` and is also used by editors.

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
- Abstract `open()`/`close()`; `Printer` calls them, and connections don't queue jobs themselves
- `visit()` dispatches on `node.kind` to an abstract `visitXxx` method per node type
- `width` is the Font A column count, passed to `layout()`
- `dotsPerLine` is `width × 12` (Font A is 12 dots wide). `image` nodes are rasterized to fit it and handed to `visitRaster` as a `RasterNode`
- Owns inline styling: `bold`/`underline`/`fontB` go through `withStyle`, which tracks the active `TextStyle` and restores the previous style afterwards (so outer styles survive nested ones). Connections implement only `applyStyle(next, previous)`

**`src/connections/escpos-connection.ts`** - Shared ESC/POS output

- `EscPosConnection` implements every visitor by emitting ESC/POS commands from `src/command.ts`; text encoded as CP437 via `iconv-lite`
- `applyStyle` sends only the commands for styles that changed; `visitLine` sets alignment/flip before the content and resets them after the line feed
- `visitRaster` prints images with `GS v 0` in bands of up to 256 rows, aligned with `ESC a`. `rasterImage` turns each `10` followed by `04`/`05`/`14` in the data into `00` (one dot), because the printer runs real-time commands even inside image data
- After each job, `print` sends `GS ( H` with a new 4-digit process ID and resolves when the printer echoes `37 22 <id> 00`, which a TM-T20III does only once the job has printed (it holds jobs while the cover is open). After `printTimeout` it asks `DLE EOT 2` for the offline cause and rejects with `UnconfirmedPrintError`; a connection drop while waiting rejects the same way. Skipped when `canReceive` is false
- Replies are only matched by kind (process ID, real-time byte), never by request order, so a stray status byte (from another program, or a real-time command in text) can't be mistaken for an answer
- Subclasses implement the transport: `connect()`, `write(bytes)`, optionally `flush()` (for buffered writes) and `close()`. They pass incoming bytes to `receive()` and call `connectionLost()` when the connection drops

**`src/connections/usb-connection.ts`** - USB transport (`EscPosConnection` subclass)

- Uses the `usb` package; auto-detects the bulk OUT endpoint on interface 0
- `findDevice()` looks the device up without opening it (throws `PrinterNotFoundError`). `connect()` finds it again, opens it and claims the interface, so a replugged printer works; it closes the device if claiming fails. `close()` never throws
- Polls the bulk IN endpoint for replies while open; without one, `canReceive` is false and jobs aren't confirmed

**`src/connections/network-connection.ts`** - Raw TCP transport, port 9100 by default (`EscPosConnection` subclass)

- `connect()` opens the socket; `write` collects bytes in memory and `flush` sends them in one write; `close()` ends the socket and never throws. If the socket died since the last job, `flush` reconnects. Incoming data goes to `receive()`, and the current socket closing calls `connectionLost()`
- The socket always has an `'error'` listener, so an error between jobs can't crash the process. Errors reach the caller through `once(socket, 'connect')` or the write callback, as `NetworkError`
- The idle timeout destroys the socket: it fails a job that is connecting or sending, and ends `close()` when the peer never closes its side. It's ignored while waiting for a confirmation, since printing a long job leaves the socket idle

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

- `Printer.create(profile)` builds the connection without opening it; throws `PrinterNotFoundError` if the USB device isn't found
- `print(receipt)` queues the job; jobs run one at a time. The connection is opened for the first job and closed when the pending count drops to 0 (counted when `print` is called, so a job queued mid-print keeps it open) or a job fails. Close errors are ignored
- `close()` stops accepting jobs (`print` then rejects with `EscposError`) and waits for the queue; calling it again does nothing
- Implements `AsyncDisposable` (`Symbol.asyncDispose` calls `close()`), so `await using printer = await Printer.create(...)` works; the examples use it

**`src/printer-profile.ts`** - Configuration

- `createUsbProfile(options)`: `vendorId`, `productId`, optional `endpoint`/`timeout`/`printTimeout` (60000ms), required `columnsPerFont: { FontA, FontB }`
- `createNetworkProfile(options)`: `host`, optional `port` (9100) / `timeout` (5000ms) / `printTimeout` (60000ms), required `columnsPerFont`
- `createConsoleProfile()`: no options, 48 columns

**`src/printer-model.ts`** - Printer presets

- `getUsbProfile(model, paperWidth = '80mm')` and `getNetworkProfile(model, { host, port?, timeout?, printTimeout? }, paperWidth = '80mm')`; only model is `TMT20III`
- Column counts per paper width: 80mm → FontA 48 / FontB 64, 58mm → FontA 35 / FontB 46 (so 576 / 420 dots)

**`src/status.ts`** - Printer replies

- `ReplyReader` splits incoming bytes into process ID responses and real-time status bytes (first byte `0xx1 xx10`); automatic status blocks (`0xx1 xx00` + 3 bytes) and other `37`/`3d`/`5f ... 00` blocks are skipped
- `parseOfflineCause` reads a `DLE EOT 2` reply into `PrinterStatus` (bit 2 cover open, bit 5 paper end, bit 6 error; checked on a TM-T20III with `scripts/probe-status.ts`)

**`src/command.ts`** / **`src/errors.ts`** - ESC/POS byte constants and error classes (`EscposError` base, `PrinterNotFoundError`, `UsbError`, `NoBulkEndpointError`, `NetworkError`, `UnconfirmedPrintError` with the printer's `status`), all exported from `src/index.ts`

### Testing

- `src/__tests__/helpers/virtual-printer.ts` interprets the ESC/POS bytes and renders the paper as text (alignment, wrapping, styles, cuts, `GS v 0` images as block characters; back-to-back bands merge). Prefer it over raw byte snapshots when checking what prints. It throws on unknown commands, so new commands need adding there
- `src/__tests__/helpers/usb-mock.ts` records bytes and answers `GS ( H` and `DLE EOT 2` on a mocked IN endpoint (`mockPrinter` changes how; `resetMockPrinter()` restores it); use it with `vi.mock('usb', async () => (await import('./helpers/usb-mock.js')).createUsbModule())`
- `network-connection.test.ts` runs a local TCP server as a fake printer (one recorded job per connection; `confirm`, `confirmDelay` and `offlineCause` options) and checks the bytes match the USB connection's
- `status.test.ts` covers reply parsing
- `printer.test.ts` covers the queue and connection lifecycle with spies on `ConsoleConnection`
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
