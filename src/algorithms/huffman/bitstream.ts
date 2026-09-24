import { HuffmanCodecError } from './errors';
import type { HuffmanCodeTable, PackedBitstream } from './types';

/** Empacota os códigos diretamente em bytes, do bit mais significativo para o menos significativo. */
export function packCodes(data: Uint8Array, table: HuffmanCodeTable): PackedBitstream {
  const output: number[] = [];
  const checkedCodes = new Set<string>();
  let currentByte = 0;
  let usedBits = 0;
  let bitLength = 0;

  for (const symbol of data) {
    const code = table[symbol];
    if (code === undefined) {
      throw new HuffmanCodecError('MISSING_CODE', `Não existe código para o símbolo ${symbol}.`);
    }
    if (!checkedCodes.has(code)) {
      if (code.length === 0 || /[^01]/u.test(code)) {
        throw new HuffmanCodecError(
          'INVALID_CODE_TABLE',
          `O código do símbolo ${symbol} não é uma sequência binária válida.`,
        );
      }
      checkedCodes.add(code);
    }

    for (const bit of code) {
      currentByte = (currentByte << 1) | (bit === '1' ? 1 : 0);
      usedBits += 1;
      bitLength += 1;
      if (usedBits === 8) {
        output.push(currentByte);
        currentByte = 0;
        usedBits = 0;
      }
    }
  }

  const paddingBits = usedBits === 0 ? 0 : 8 - usedBits;
  if (usedBits > 0) output.push(currentByte << paddingBits);

  return Object.freeze({ bytes: Uint8Array.from(output), bitLength, paddingBits });
}

/** Confere comprimento, padding e os bits não utilizados do último byte. */
export function validatePackedBitstream(
  bytes: Uint8Array,
  bitLength: number,
  paddingBits: number,
): void {
  if (!Number.isSafeInteger(bitLength) || bitLength < 0) {
    throw new HuffmanCodecError(
      'INVALID_BIT_LENGTH',
      `Comprimento de bits inválido: ${bitLength}.`,
    );
  }
  if (!Number.isInteger(paddingBits) || paddingBits < 0 || paddingBits > 7) {
    throw new HuffmanCodecError('INVALID_PADDING', `Padding inválido: ${paddingBits}.`);
  }

  const expectedByteLength = Math.ceil(bitLength / 8);
  if (bytes.length !== expectedByteLength) {
    throw new HuffmanCodecError(
      'PAYLOAD_LENGTH_MISMATCH',
      `O payload possui ${bytes.length} bytes; eram esperados ${expectedByteLength}.`,
    );
  }

  const expectedPadding = (8 - (bitLength % 8)) % 8;
  if (paddingBits !== expectedPadding) {
    throw new HuffmanCodecError(
      'INVALID_PADDING',
      `O cabeçalho declara ${paddingBits} bits de padding; eram esperados ${expectedPadding}.`,
    );
  }

  if (paddingBits > 0) {
    const lastByte = bytes[bytes.length - 1];
    const paddingMask = (1 << paddingBits) - 1;
    if (lastByte === undefined || (lastByte & paddingMask) !== 0) {
      throw new HuffmanCodecError(
        'INVALID_PADDING_BITS',
        'Os bits de padding do último byte devem ser zero.',
      );
    }
  }
}

/** Itera apenas pelos bits úteis do payload, ignorando o padding já validado. */
export function* readBits(bytes: Uint8Array, bitLength: number): IterableIterator<0 | 1> {
  const paddingBits = (8 - (bitLength % 8)) % 8;
  validatePackedBitstream(bytes, bitLength, paddingBits);

  for (let index = 0; index < bitLength; index++) {
    const byte = bytes[index >> 3];
    if (byte === undefined) {
      throw new HuffmanCodecError('INVALID_BIT_LENGTH', 'O bit solicitado não existe no payload.');
    }
    yield ((byte >> (7 - (index & 7))) & 1) as 0 | 1;
  }
}
