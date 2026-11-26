# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

Uses pnpm and Node.js ≥24 (see `.nvmrc`).

```bash
pnpm install                          # Install dependencies
pnpm test                             # Run tests (vitest)
pnpm typecheck                        # Type-check src/ (tsc --noEmit)
pnpm lint                             # Lint src/ (oxlint, type-aware)
pnpm format                           # Format everything (oxfmt, also sorts imports)
pnpm build                            # Compile to dist/
pnpm tsx examples/example.ts          # Console output example
pnpm tsx examples/example-usb.ts      # USB printer feature showcase
pnpm tsx examples/example-charset.ts  # CP437 character set on USB printer
./scripts/release.sh <major|minor|patch>  # Bump version, tag, push
```

CI runs typecheck, lint, format check, test and build. The pre-commit hook runs lint-staged (oxlint + oxfmt). `tsconfig.json` only includes `src/`, so examples are not type-checked.

## Architecture

This is an ESC/POS thermal printer library for TypeScript/Node.js (ESM only).

### Core Modules

**`src/receipt.ts`** - AST-based receipt builder

- Each node type is exported (`TextNode`, `BoldNode`, ...); `InlineNode` and `BlockNode` group them, and `Node` is their union
- Block nodes: `line`, `blank`, `feed`, `cut`, `partialCut`, plus `LayoutNode`s (`paragraph`, `rule`, `pair`, `table`) laid out by `layout.ts`
- Inline nodes (per-character styles, nest freely): `bold`, `underline` (`'normal' | 'thick'`), `fontB`, `span` (siblings); leaf: `text`
- `Content` (`string | InlineNode | Content[]`) is what helpers and `line()` accept; `toNode` turns strings into `text` and arrays into `span`
- Line-level settings are `LineOptions` on `line(content, { align, flip })`, stored on `LineNode`. The printer applies alignment and upside-down mode when the line prints, so they must not be modelled as inline nodes
- `Receipt` class with fluent API that appends nodes to a flat list; `append`, `each` and `when` compose receipts without breaking the chain; `nodes()` returns a copy
- Helper functions accept `string | Node` and wrap strings in a `TextNode`

**`src/connections/printer-connection.ts`** - Abstract visitor base

- `print(receipt)` calls `reset()`, visits each node, then calls `reset()` again
- `visit()` dispatches on `node.kind` to an abstract `visitXxx` method per node type
- `width` is the Font A column count, passed to `layout()`
- Owns inline styling: `bold`/`underline`/`fontB` go through `withStyle`, which tracks the active `TextStyle` and restores the previous style afterwards (so outer styles survive nested ones). Connections implement only `applyStyle(next, previous)`

**`src/connections/usb-connection.ts`** - USB thermal printer output

- Emits ESC/POS commands from `src/command.ts`; text encoded as CP437 via `iconv-lite`
- `applyStyle` sends only the commands for styles that changed; `visitLine` sets alignment/flip before the content and resets them after the line feed
- Uses the `usb` package; auto-detects the bulk OUT endpoint on interface 0

**`src/connections/console-connection.ts`** - ANSI terminal output

- Bold/underline via ANSI codes (`applyStyle` resets and re-enables when a style ends); `visitLine` aligns with space padding
- Font B and `flip` are ignored, and their content prints as plain text

**`src/layout.ts`** - Width-dependent layout

- `layout(node, width)` turns `LayoutNode`s (`paragraph`, `rule`, `pair`, `table`) into plain `LineNode`s at print time, keeping inline styles (`wrap` and `slice` work on styled trees)
- The base connection calls it, so connections don't implement visitors for these nodes
- Widths are counted in characters (Font A columns); Font B inside layouts isn't measured exactly

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

### Testing

- `src/__tests__/helpers/virtual-printer.ts` interprets the ESC/POS bytes and renders the paper as text (alignment, wrapping, styles, cuts). Prefer it over raw byte snapshots when checking what prints. It throws on unknown commands, so new commands need adding there
- `src/__tests__/helpers/usb-mock.ts` records bytes; use it with `vi.mock('usb', async () => (await import('./helpers/usb-mock.js')).createUsbModule())`
- `console-connection.test.ts` captures stdout and replaces ANSI codes with readable tags
- Tests are excluded from `tsconfig.json` and oxlint (`ignorePatterns` in `.oxlintrc.json`)

### Adding a Node Type

1. Add the node type to the `InlineNode` or `BlockNode` union (plus a helper or `Receipt` method) in `receipt.ts`
2. Add a `case` in `PrinterConnection.visit()` and an abstract `visitXxx`, then implement it in both `UsbConnection` and `ConsoleConnection`
3. Exceptions: a node that can be expressed as lines is a `LayoutNode` handled in `layout.ts` (no visitors). A new character style is a `TextStyle` field plus a `withStyle` case. Inline nodes also need `textOf` and `slice` in `layout.ts`
4. Export it from `src/index.ts` and add tests (USB tests are byte-stream snapshots with `usb` mocked)

### Key Patterns

- **AST + Visitor**: Receipt is an AST of nodes; connections implement visitors
- **Composable styling**: `bold(underline('Hello'))` for nested formatting, arrays for mixed styles: `['Total: ', bold('$5')]`
- **Factory functions**: Simple `createXxxProfile()` instead of builders
