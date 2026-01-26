// Main exports
export { Printer } from './printer';
export {
  PrinterProfile,
  PrinterConnectionData,
  UsbConnectionData,
  NetworkConnectionData,
  ConsoleConnectionData,
  UsbProfileOptions,
  ConsoleProfileOptions,
  createUsbProfile,
  createConsoleProfile,
} from './printer-profile';
export { PrinterModel, PaperWidth, getUsbProfile } from './printer-model';

// Receipt builder exports
export { Receipt, Node, bold, underline, left, center, right } from './receipt';

// ESC/POS command constants
export {
  FEED,
  CUT,
  PARTIAL_CUT,
  RESET,
  PRINT_MODE_DEFAULT,
  BOLD_ON,
  BOLD_OFF,
  UNDERLINE_OFF,
  UNDERLINE_1DOT,
  UNDERLINE_2DOT,
  BITMAP,
  LINE_SPACING_0,
  LINE_SPACING_RESET,
  ALIGN_LEFT,
  ALIGN_CENTER,
  ALIGN_RIGHT,
} from './command';
export { Font, fontToBytes } from './font';
export { Charset, charsetToBytes } from './charset';
export { CodeTable, codeTableToBytes } from './code-table';

// Formatter exports
export { Formatter, TableOptions } from './formatter';

// Connection exports
export {
  PrinterConnection,
  UsbConnection,
  ConsoleConnection,
} from './connections';

// Error exports
export {
  EscposError,
  NoFontFoundError,
  UnsupportedFontError,
  NoBulkEndpointError,
  UnsupportedForConnectionError,
  UsbError,
  EncodingError,
  PrinterNotFoundError,
} from './errors';
