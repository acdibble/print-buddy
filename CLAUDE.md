# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
npm install                    # Install dependencies
npm test                       # Run tests
npm run example                # Console output example
npm run example:usb            # USB printer example
npm run example:receipt        # Receipt builder example
```

## Architecture

This is an ESC/POS thermal printer library for TypeScript/Node.js.

### Core Modules

**`src/receipt.ts`** - AST-based receipt builder
- `Node` type defines AST nodes: text, bold, underline, line, blank, table, cut
- `Receipt` class with fluent API for building documents
- Helper functions: `text()`, `bold()`, `underline()` for composable styling

**`src/connections/printer-connection.ts`** - Abstract visitor pattern base
- `PrinterConnection` abstract class with `print(receipt)` method
- Visitor methods for each node type (visitText, visitBold, etc.)

**`src/connections/console-connection.ts`** - ANSI terminal output
- Renders receipts using ANSI escape codes for styling

**`src/connections/usb-connection.ts`** - USB thermal printer output
- Renders receipts using ESC/POS commands
- Uses `usb` package for native USB communication

**`src/printer.ts`** - Main printer interface
- `Printer.create(profile)` factory method
- Delegates `print(receipt)` to underlying connection

**`src/printer-profile.ts`** - Configuration
- `createUsbProfile(options)` and `createConsoleProfile(options)` factories
- Configures connection type, paper width, font columns

**`src/printer-model.ts`** - Printer presets
- `getUsbProfile(model, paperWidth)` for known printer models
- Paper width mapping: '80mm' → 576 dots, '58mm' → 384 dots

### Key Patterns

- **AST + Visitor**: Receipt is an AST of nodes; connections implement visitors
- **Composable styling**: `bold(underline(text('Hello')))` for nested formatting
- **Factory functions**: Simple `createXxxProfile()` instead of builders
