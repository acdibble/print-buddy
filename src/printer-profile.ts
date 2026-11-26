type Font = 'FontA' | 'FontB';

const DEFAULT_PRINT_TIMEOUT = 60_000;

export interface UsbConnectionData {
  type: 'usb';
  vendorId: number;
  productId: number;
  endpoint?: number;
  timeout: number;
  printTimeout: number;
}

export interface NetworkConnectionData {
  type: 'network';
  host: string;
  port: number;
  timeout: number;
  printTimeout: number;
}

export interface ConsoleConnectionData {
  type: 'console';
}

export type PrinterConnectionData =
  | UsbConnectionData
  | NetworkConnectionData
  | ConsoleConnectionData;

export interface PrinterProfile {
  connectionData: PrinterConnectionData;
  columnsPerFont: Record<Font, number>;
}

export interface UsbProfileOptions {
  vendorId: number;
  productId: number;
  endpoint?: number;
  timeout?: number;
  /** Milliseconds to wait for the printer to confirm a job, including while it's offline (default: 60000) */
  printTimeout?: number;
  columnsPerFont: Record<Font, number>;
}

export interface NetworkProfileOptions {
  host: string;
  port?: number;
  timeout?: number;
  /** Milliseconds to wait for the printer to confirm a job, including while it's offline (default: 60000) */
  printTimeout?: number;
  columnsPerFont: Record<Font, number>;
}

export interface ConsoleProfileOptions {
  width?: number;
}

export function createUsbProfile(options: UsbProfileOptions): PrinterProfile {
  return {
    connectionData: {
      type: 'usb',
      vendorId: options.vendorId,
      productId: options.productId,
      endpoint: options.endpoint,
      timeout: options.timeout ?? 2000,
      printTimeout: options.printTimeout ?? DEFAULT_PRINT_TIMEOUT,
    },
    columnsPerFont: options.columnsPerFont,
  };
}

export function createNetworkProfile(options: NetworkProfileOptions): PrinterProfile {
  return {
    connectionData: {
      type: 'network',
      host: options.host,
      port: options.port ?? 9100,
      timeout: options.timeout ?? 5000,
      printTimeout: options.printTimeout ?? DEFAULT_PRINT_TIMEOUT,
    },
    columnsPerFont: options.columnsPerFont,
  };
}

export function createConsoleProfile(): PrinterProfile {
  return {
    connectionData: { type: 'console' },
    columnsPerFont: { FontA: 48, FontB: 48 },
  };
}
