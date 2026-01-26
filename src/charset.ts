/**
 * Possible international character sets
 */
export type Charset =
  | 'USA'
  | 'France'
  | 'Germany'
  | 'UK'
  | 'Denmark1'
  | 'Sweden'
  | 'Italy'
  | 'Spain1'
  | 'Japan'
  | 'Norway'
  | 'Denmark2'
  | 'Spain2'
  | 'LatinAmerica'
  | 'Korea'
  | 'SloveniaCroatia'
  | 'China'
  | 'Vietnam'
  | 'Arabia';

/**
 * Get the byte representation of a charset
 */
export function charsetToBytes(charset: Charset): Uint8Array {
  const map: Record<Charset, number> = {
    USA: 0x00,
    France: 0x01,
    Germany: 0x02,
    UK: 0x03,
    Denmark1: 0x04,
    Sweden: 0x05,
    Italy: 0x06,
    Spain1: 0x07,
    Japan: 0x08,
    Norway: 0x09,
    Denmark2: 0x0a,
    Spain2: 0x0b,
    LatinAmerica: 0x0c,
    Korea: 0x0d,
    SloveniaCroatia: 0x0e,
    China: 0x0f,
    Vietnam: 0x10,
    Arabia: 0x11,
  };
  return new Uint8Array([map[charset]]);
}
