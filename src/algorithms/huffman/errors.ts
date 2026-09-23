export class InvalidFrequencyTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFrequencyTableError';
  }
}

export class InvalidHuffmanTreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHuffmanTreeError';
  }
}

export type HuffmanCodecErrorCode =
  | 'EXCESS_DATA'
  | 'INCOMPLETE_CODE'
  | 'INVALID_BIT_LENGTH'
  | 'INVALID_CODE_TABLE'
  | 'INVALID_HEADER'
  | 'INVALID_MAGIC'
  | 'INVALID_PADDING'
  | 'INVALID_PADDING_BITS'
  | 'INVALID_TREE'
  | 'LENGTH_MISMATCH'
  | 'MISSING_CODE'
  | 'MISSING_TREE'
  | 'PAYLOAD_LENGTH_MISMATCH'
  | 'SIZE_LIMIT_EXCEEDED'
  | 'TRAILING_HEADER_DATA'
  | 'TRUNCATED_HEADER'
  | 'UNSUPPORTED_VERSION';

/** Erro esperado e identificável ao codificar ou validar dados Huffman. */
export class HuffmanCodecError extends Error {
  constructor(
    readonly code: HuffmanCodecErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HuffmanCodecError';
  }
}
