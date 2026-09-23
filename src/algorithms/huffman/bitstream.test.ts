import { describe, expect, it } from 'vitest';
import { packCodes, readBits, validatePackedBitstream } from './bitstream';
import type { HuffmanCodeTable } from './types';

describe('bitstream', () => {
  it('empacota códigos cruzando fronteiras de byte e informa o padding', () => {
    const table = Object.freeze({ 0: '1', 1: '010', 2: '11' }) satisfies HuffmanCodeTable;
    const packed = packCodes(Uint8Array.of(0, 1, 2), table);

    expect(packed.bytes).toEqual(Uint8Array.of(0b1010_1100));
    expect(packed.bitLength).toBe(6);
    expect(packed.paddingBits).toBe(2);
    expect([...readBits(packed.bytes, packed.bitLength)]).toEqual([1, 0, 1, 0, 1, 1]);
  });

  it('não adiciona padding quando o último byte está completo', () => {
    const table = Object.freeze({ 0: '10101010' }) satisfies HuffmanCodeTable;
    const packed = packCodes(Uint8Array.of(0), table);

    expect(packed.bytes).toEqual(Uint8Array.of(0xaa));
    expect(packed.bitLength).toBe(8);
    expect(packed.paddingBits).toBe(0);
  });

  it('trata um fluxo vazio sem bytes ou padding', () => {
    const packed = packCodes(new Uint8Array(), Object.freeze({}));

    expect(packed.bytes).toEqual(new Uint8Array());
    expect(packed.bitLength).toBe(0);
    expect(packed.paddingBits).toBe(0);
  });

  it('rejeita símbolo ausente e código não binário', () => {
    expect(() => packCodes(Uint8Array.of(1), Object.freeze({ 0: '0' }))).toThrowError(
      expect.objectContaining({ code: 'MISSING_CODE' }),
    );
    expect(() => packCodes(Uint8Array.of(0), Object.freeze({ 0: '02' }))).toThrowError(
      expect.objectContaining({ code: 'INVALID_CODE_TABLE' }),
    );
  });

  it('rejeita tamanho, padding e bits de padding incoerentes', () => {
    expect(() => validatePackedBitstream(Uint8Array.of(), 1, 7)).toThrowError(
      expect.objectContaining({ code: 'PAYLOAD_LENGTH_MISMATCH' }),
    );
    expect(() => validatePackedBitstream(Uint8Array.of(0), 1, 0)).toThrowError(
      expect.objectContaining({ code: 'INVALID_PADDING' }),
    );
    expect(() => validatePackedBitstream(Uint8Array.of(1), 1, 7)).toThrowError(
      expect.objectContaining({ code: 'INVALID_PADDING_BITS' }),
    );
  });
});
