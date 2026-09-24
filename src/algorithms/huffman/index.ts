export { packCodes, readBits, validatePackedBitstream } from './bitstream';
export { buildCodeTable, isPrefixFree } from './buildCodeTable';
export {
  buildHuffmanTree,
  buildHuffmanTreeFromFrequencies,
  validateHuffmanTree,
} from './buildTree';
export { encode, decode } from './codec';
export { countFrequencies } from './countFrequencies';
export { HuffmanCodecError, InvalidFrequencyTableError, InvalidHuffmanTreeError } from './errors';
export type {
  EncodedHuffmanData,
  FrequencyTable,
  HuffmanBuildResult,
  HuffmanCodeTable,
  HuffmanInternalNode,
  HuffmanLeaf,
  HuffmanMergeStep,
  HuffmanMetrics,
  HuffmanNode,
  HuffmanSymbol,
  PackedBitstream,
  SymbolFrequency,
} from './types';
