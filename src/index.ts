// Errors
export {
  EscposError,
  NetworkError,
  NoBulkEndpointError,
  UnsupportedFontError,
  UsbError,
} from './errors.js';

// Printer
export { Printer } from './printer.js';
export {
  getNetworkProfile,
  getUsbProfile,
  type PaperWidth,
  type PrinterModel,
} from './printer-model.js';
export {
  type ConsoleConnectionData,
  type ConsoleProfileOptions,
  createConsoleProfile,
  createNetworkProfile,
  createUsbProfile,
  type NetworkConnectionData,
  type NetworkProfileOptions,
  type PrinterProfile,
  type UsbConnectionData,
  type UsbProfileOptions,
} from './printer-profile.js';

// Receipt builder
export {
  type Align,
  type BlankNode,
  type BlockNode,
  bold,
  type BoldNode,
  type Content,
  type CutNode,
  type FeedNode,
  fontB,
  type FontBNode,
  type InlineNode,
  type LayoutNode,
  type LineNode,
  type LineOptions,
  type Node,
  type PairNode,
  type PairOptions,
  type ParagraphNode,
  type PartialCutNode,
  Receipt,
  type RuleNode,
  type SpanNode,
  type TableColumn,
  type TableNode,
  type TableOptions,
  type TextNode,
  underline,
  type UnderlineNode,
} from './receipt.js';
