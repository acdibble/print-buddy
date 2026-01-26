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
 * Error when no font is found in the printer profile
 */
export class NoFontFoundError extends EscposError {
  constructor() {
    super('No font found in printer profile');
    this.name = 'NoFontFoundError';
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
 * Error when the operation is not supported for the current connection type
 */
export class UnsupportedForConnectionError extends EscposError {
  constructor() {
    super('Operation not supported for this connection type');
    this.name = 'UnsupportedForConnectionError';
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
 * Error during character encoding
 */
export class EncodingError extends EscposError {
  constructor(message: string) {
    super(`Encoding error: ${message}`);
    this.name = 'EncodingError';
  }
}

/**
 * Error when printer is not found
 */
export class PrinterNotFoundError extends EscposError {
  constructor() {
    super('Printer not found');
    this.name = 'PrinterNotFoundError';
  }
}
