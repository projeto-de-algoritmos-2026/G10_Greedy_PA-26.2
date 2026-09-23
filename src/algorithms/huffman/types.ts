/** Um símbolo do codec corresponde exatamente a um byte. */
export type HuffmanSymbol = number;

export interface SymbolFrequency {
  readonly symbol: HuffmanSymbol;
  readonly weight: number;
}

export type FrequencyTable = readonly SymbolFrequency[];

interface HuffmanNodeBase {
  /** Identificador estável para históricos e visualizações. */
  readonly id: string;
  readonly weight: number;
}

export interface HuffmanLeaf extends HuffmanNodeBase {
  readonly kind: 'leaf';
  readonly symbol: HuffmanSymbol;
}

export interface HuffmanInternalNode extends HuffmanNodeBase {
  readonly kind: 'internal';
  readonly left: HuffmanNode;
  readonly right: HuffmanNode;
}

export type HuffmanNode = HuffmanLeaf | HuffmanInternalNode;

export interface HuffmanMergeStep {
  readonly index: number;
  readonly firstExtracted: HuffmanNode;
  readonly secondExtracted: HuffmanNode;
  readonly merged: HuffmanInternalNode;
}

export interface HuffmanBuildResult {
  readonly frequencies: FrequencyTable;
  readonly root: HuffmanNode | null;
  readonly history: readonly HuffmanMergeStep[];
}

/** As chaves numéricas são convertidas em propriedades do objeto pelo JavaScript. */
export type HuffmanCodeTable = Readonly<Partial<Record<HuffmanSymbol, string>>>;

export interface PackedBitstream {
  readonly bytes: Uint8Array;
  readonly bitLength: number;
  readonly paddingBits: number;
}

export interface HuffmanMetrics {
  readonly originalByteLength: number;
  readonly headerByteLength: number;
  readonly payloadBitLength: number;
  readonly payloadByteLength: number;
  readonly paddingBitLength: number;
  readonly totalByteLength: number;
  readonly totalBitLength: number;
}

export interface EncodedHuffmanData {
  readonly header: Uint8Array;
  readonly payload: Uint8Array;
  readonly metrics: HuffmanMetrics;
}
