/**
 * Possible code tables
 */
export type CodeTable = 'USA' | 'Latin2';

/**
 * Get the byte representation of a code table
 */
export function codeTableToBytes(codeTable: CodeTable): Uint8Array {
  const map: Record<CodeTable, number> = {
    USA: 0x00,
    Latin2: 0x02,
  };
  return new Uint8Array([map[codeTable]]);
}
