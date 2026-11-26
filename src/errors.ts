import type { PrinterStatus } from './status.js';

/**
 * Base error class for ESC/POS errors
 */
export class EscposError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EscposError';
  }
}

/**
 * Error when the specified font is not supported by the printer
 */
export class UnsupportedFontError extends EscposError {
  constructor() {
    super('Unsupported font for this printer');
    this.name = 'UnsupportedFontError';
  }
}

const usbId = (id: number) => `0x${id.toString(16).padStart(4, '0')}`;

/**
 * Error when no USB device matches the printer's vendor and product IDs
 */
export class PrinterNotFoundError extends EscposError {
  constructor(
    readonly vendorId: number,
    readonly productId: number,
  ) {
    super(
      `No USB printer found with vendor ID ${usbId(vendorId)} and product ID ${usbId(productId)}`,
    );
    this.name = 'PrinterNotFoundError';
  }
}

/**
 * Error when no bulk endpoint is found on the USB device
 */
export class NoBulkEndpointError extends EscposError {
  constructor() {
    super('No bulk endpoint found on USB device');
    this.name = 'NoBulkEndpointError';
  }
}

/**
 * Error during USB operations
 */
export class UsbError extends EscposError {
  constructor(message: string) {
    super(`USB error: ${message}`);
    this.name = 'UsbError';
  }
}

/**
 * Error during network operations
 */
export class NetworkError extends EscposError {
  constructor(message: string) {
    super(`Network error: ${message}`);
    this.name = 'NetworkError';
  }
}

/**
 * Error when the printer didn't confirm a job it was sent
 *
 * The job may still print, for example once the cover is closed, so don't
 * send it again automatically.
 */
export class UnconfirmedPrintError extends EscposError {
  constructor(
    message: string,
    /** The printer's offline cause, or `null` if it didn't answer */
    readonly status: PrinterStatus | null,
    options?: ErrorOptions,
  ) {
    super(message);
    this.name = 'UnconfirmedPrintError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
