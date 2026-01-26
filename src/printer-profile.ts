import { Font } from './font.js';

export interface UsbConnectionData {
  type: 'usb';
  vendorId: number;
  productId: number;
  endpoint?: number;
  timeout: number;
}

export interface NetworkConnectionData {
  type: 'network';
  host: string;
  port: number;
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
  columnsPerFont: Map<Font, number>;
  width: number;
}

export interface UsbProfileOptions {
  vendorId: number;
  productId: number;
  endpoint?: number;
  timeout?: number;
  fontColumns?: number;
  width?: number;
}

export interface ConsoleProfileOptions {
  fontColumns?: number;
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
    },
    columnsPerFont: new Map([['FontA', options.fontColumns ?? 48]]),
    width: options.width ?? 576,
  };
}

export function createConsoleProfile(options: ConsoleProfileOptions = {}): PrinterProfile {
  return {
    connectionData: { type: 'console' },
    columnsPerFont: new Map([['FontA', options.fontColumns ?? 32]]),
    width: options.width ?? 384,
  };
}
