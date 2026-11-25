# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

Uses pnpm and Node.js ≥24 (see `.nvmrc`).

```bash
pnpm install                          # Install dependencies
pnpm test                             # Run tests (vitest)
pnpm typecheck                        # Type-check src/ (tsc --noEmit)
pnpm lint                             # Lint src/ (eslint)
pnpm build                            # Compile to dist/
pnpm tsx examples/example.ts          # Console output example
pnpm tsx examples/example-usb.ts      # USB printer feature showcase
pnpm tsx examples/example-charset.ts  # CP437 character set on USB printer
./scripts/release.sh <major|minor|patch>  # Bump version, tag, push
```

CI runs typecheck, test and build. The pre-commit hook runs lint-staged (eslint + prettier). `tsconfig.json` only includes `src/`, so examples are not type-checked.

## Architecture

This is an ESC/POS thermal printer library for TypeScript/Node.js (ESM only).

### Core Modules

**`src/receipt.ts`** - AST-based receipt builder

- Each node type is exported (`TextNode`, `BoldNode`, ...) and `Node` is their union
- Block nodes: `line`, `blank`, `table`, `feed`, `cut`, `partialCut`
- Inline wrapper nodes: `bold`, `underline` (`'normal' | 'thick'`), `fontB`, `flip`, `left`, `center`, `right`; leaf: `text`
- `Receipt` class with fluent API that appends nodes to a flat list
- Helper functions accept `string | Node` and wrap strings in a `TextNode`

**`src/connections/printer-connection.ts`** - Abstract visitor base

- `print(receipt)` calls `reset()`, visits each node, then calls `reset()` again
- `visit()` dispatches on `node.kind` to an abstract `visitXxx` method per node type
- Holds a `Formatter` built with the Font A column width

**`src/connections/usb-connection.ts`** - USB thermal printer output

- Emits ESC/POS commands from `src/command.ts`; text encoded as CP437 via `iconv-lite`
- Style wrappers emit ON → child → OFF; alignment has no OFF, so `visitLine` resets flip and alignment after the newline
- Uses the `usb` package; auto-detects the bulk OUT endpoint on interface 0

**`src/connections/console-connection.ts`** - ANSI terminal output

- Bold/underline via ANSI codes; center/right via space padding
- Font B and flip are ignored, and their content prints as plain text

**`src/formatter.ts`** - Text layout helpers

- `duoTable` (used for `table` nodes), plus `trioTable` and `spaceSplit` (not yet wired to nodes)

**`src/printer.ts`** - Main printer interface

- `Printer.create(profile)` builds the connection; returns `null` if the USB device isn't found
- Delegates `print(receipt)` and `close()` to the connection

**`src/printer-profile.ts`** - Configuration

- `createUsbProfile(options)`: `vendorId`, `productId`, optional `endpoint`/`timeout`, required `columnsPerFont: { FontA, FontB }`
- `createConsoleProfile()`: no options, 48 columns

**`src/printer-model.ts`** - Printer presets

- `getUsbProfile(model, paperWidth = '80mm')`; only model is `TMT20III`
- Column counts per paper width: 80mm → FontA 48 / FontB 64, 58mm → FontA 35 / FontB 46

**`src/command.ts`** / **`src/errors.ts`** - ESC/POS byte constants and error classes (`UsbError`, `NoBulkEndpointError`)

### Adding a Node Type

1. Add the node type and the `Node` union member (plus a helper or `Receipt` method) in `receipt.ts`
2. Add a `case` in `PrinterConnection.visit()` and an abstract `visitXxx`
3. Implement it in both `UsbConnection` and `ConsoleConnection`, and in `ConsoleConnection.extractText` if it wraps a child
4. Export it from `src/index.ts` and add tests (USB tests are byte-stream snapshots with `usb` mocked)

### Key Patterns

- **AST + Visitor**: Receipt is an AST of nodes; connections implement visitors
- **Composable styling**: `bold(underline('Hello'))` for nested formatting
- **Factory functions**: Simple `createXxxProfile()` instead of builders
