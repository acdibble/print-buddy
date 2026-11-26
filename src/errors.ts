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
