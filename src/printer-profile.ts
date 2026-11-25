type Font = 'FontA' | 'FontB';

export interface UsbConnectionData {
  type: 'usb';
  vendorId: number;
  productId: number;
  endpoint?: number;
  timeout: number;
}

export interface ConsoleConnectionData {
  type: 'console';
}

export type PrinterConnectionData = UsbConnectionData | ConsoleConnectionData;

export interface PrinterProfile {
  connectionData: PrinterConnectionData;
  columnsPerFont: Record<Font, number>;
}

export interface UsbProfileOptions {
  vendorId: number;
  productId: number;
  endpoint?: number;
  timeout?: number;
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
