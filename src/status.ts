/**
 * Why the printer isn't printing, from its offline cause status (DLE EOT 2)
 */
export interface PrinterStatus {
  readonly coverOpen: boolean;
  /** Printing stopped because the roll ran out */
  readonly paperEnd: boolean;
  readonly error: boolean;
}

export function parseOfflineCause(byte: number): PrinterStatus {
  return {
    coverOpen: (byte & 0x04) !== 0,
    paperEnd: (byte & 0x20) !== 0,
    error: (byte & 0x40) !== 0,
  };
}

export function describeStatus(status: PrinterStatus): string {
  const causes = [
    status.coverOpen && 'cover open',
    status.paperEnd && 'out of paper',
    status.error && 'printer error',
  ].filter(Boolean);
  return causes.length > 0 ? causes.join(', ') : 'printer reports no problem';
}

export type Reply = { kind: 'process-id'; id: string } | { kind: 'real-time'; byte: number };

/** Response blocks (`37 ...`, `3d ...`, `5f ...`) end with NUL; give up on one that runs longer */
const MAX_BLOCK = 64;

/**
 * Splits the bytes a printer sends into replies. Process ID responses and
 * real-time status bytes are returned; automatic status (ASB) and anything
 * unrecognised is skipped.
 */
export class ReplyReader {
  private pending: number[] = [];

  push(bytes: Uint8Array): Reply[] {
    this.pending.push(...bytes);
    const replies: Reply[] = [];
    for (;;) {
      const result = this.next();
      if (result === 'incomplete') break;
      if (result) replies.push(result);
    }
    return replies;
  }

  clear(): void {
    this.pending = [];
  }

  private next(): Reply | null | 'incomplete' {
    if (this.pending.length === 0) return 'incomplete';
    const first = this.pending[0];

    if (first === 0x37 || first === 0x3d || first === 0x5f) {
      const end = this.pending.indexOf(0x00);
      if (end === -1) {
        if (this.pending.length < MAX_BLOCK) return 'incomplete';
        this.pending.shift();
        return null;
      }
      const block = this.pending.splice(0, end + 1);
      return first === 0x37 && block[1] === 0x22
        ? { kind: 'process-id', id: String.fromCharCode(...block.slice(2, -1)) }
        : null;
    }

    if ((first & 0x93) === 0x10) {
      if (this.pending.length < 4) return 'incomplete';
      this.pending.splice(0, 4);
      return null;
    }

    this.pending.shift();
    return (first & 0x93) === 0x12 ? { kind: 'real-time', byte: first } : null;
  }
}
