export { packCodes, readBits, validatePackedBitstream } from './bitstream';
export { buildCodeTable, isPrefixFree } from './buildCodeTable';
export {
  buildCanonicalCodeTable,
  buildCanonicalCodeTableFromTree,
  buildCanonicalDecoder,
  createCanonicalSymbolReader,
  deriveCodeLengths,
  deserializeCanonicalTable,
  serializeCanonicalTable,
  validateCodeLengths,
} from './canonical';
export type {
  CanonicalDecoder,
  CanonicalSymbolReader,
  CodeLengthTable,
  SymbolCodeLength,
} from './canonical';
export { decodeCanonical, encodeCanonical } from './canonicalCodec';
export {
  buildHuffmanTree,
  buildHuffmanTreeFromFrequencies,
  validateHuffmanTree,
} from './buildTree';
export { decode, encode, packContainer, unpackContainer } from './codec';
export { countFrequencies } from './countFrequencies';
export { HuffmanCodecError, InvalidFrequencyTableError, InvalidHuffmanTreeError } from './errors';
export type {
  EncodedHuffmanData,
  FrequencyTable,
  HuffmanBuildResult,
  HuffmanCodeTable,
  HuffmanContainer,
  HuffmanHeaderFields,
  HuffmanInternalNode,
  HuffmanLeaf,
  HuffmanMergeStep,
  HuffmanMetrics,
  HuffmanNode,
  HuffmanSymbol,
  PackedBitstream,
  SymbolFrequency,
} from './types';
