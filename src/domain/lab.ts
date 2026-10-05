import {
  buildCodeTable,
  buildHuffmanTree,
  decode,
  encode,
  HuffmanCodecError,
  packContainer,
  unpackContainer,
} from '../algorithms/huffman';
import type {
  HuffmanHeaderFields,
  HuffmanMergeStep,
  HuffmanMetrics,
  HuffmanNode,
} from '../algorithms/huffman';

const MEBIBYTE = 1024 * 1024;
/** Pior cabeçalho v1: 13 bytes fixos, 256 folhas de 6 bytes e 255 ramos de 1 byte. */
const MAX_HEADER_BYTE_LENGTH = 13 + 256 * 6 + 255;

/**
 * Limites do laboratório. A análise roda de forma síncrona na thread da interface, então a
 * entrada é limitada para manter a página responsiva. Como Huffman nunca usa mais de 8 bits por
 * byte, um contêiner gerado aqui cabe em `entrada + cabeçalho máximo`.
 */
export const LAB_LIMITS = Object.freeze({
  maxInputByteLength: MEBIBYTE,
  maxContainerByteLength: MEBIBYTE + MAX_HEADER_BYTE_LENGTH,
});

export type LabErrorCode =
  | 'EMPTY_INPUT'
  | 'INPUT_TOO_LARGE'
  | 'CONTAINER_TOO_LARGE'
  | 'RESTORED_TOO_LARGE'
  | 'INVALID_CONTAINER'
  | 'ROUND_TRIP_FAILED';

/** Erro esperado do laboratório, com mensagem pronta para ser exibida ao usuário. */
export class LabError extends Error {
  constructor(
    readonly code: LabErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LabError';
  }
}

export interface LabSymbolStat {
  readonly symbol: number;
  readonly weight: number;
  /** Fração das ocorrências, entre 0 e 1. */
  readonly relativeFrequency: number;
  readonly code: string;
}

export interface LabRates {
  /** Σ f(s)·l(s) / Σ f(s), em bits por byte de entrada. */
  readonly averageCodeLength: number;
  /** Entropia de Shannon da entrada; limite inferior para qualquer código de prefixo. */
  readonly entropyBitsPerSymbol: number;
  /** Bits úteis / bits originais: taxa teórica, sem cabeçalho nem padding. */
  readonly payloadRatio: number;
  /** Bytes armazenados (cabeçalho + payload com padding) / bytes originais. */
  readonly effectiveRatio: number;
  readonly effectiveSavingRatio: number;
  /** Verdadeiro quando o arquivo codificado é maior que o original. */
  readonly expands: boolean;
}

export interface LabAnalysis {
  readonly originalByteLength: number;
  /** Símbolos presentes, do mais frequente para o menos frequente. */
  readonly symbols: readonly LabSymbolStat[];
  readonly tree: HuffmanNode;
  readonly mergeHistory: readonly HuffmanMergeStep[];
  readonly header: HuffmanHeaderFields;
  readonly headerBytes: Uint8Array;
  readonly metrics: HuffmanMetrics;
  readonly rates: LabRates;
  /** Arquivo `.huf`: cabeçalho seguido do payload. */
  readonly container: Uint8Array;
  /** Bytes obtidos decodificando `container`; idênticos à entrada. */
  readonly restored: Uint8Array;
}

export interface LabRestoration {
  readonly header: HuffmanHeaderFields;
  readonly containerByteLength: number;
  readonly restored: Uint8Array;
}

/** Formata tamanhos em unidades binárias; valores abaixo de 1 KiB ficam em bytes exatos. */
export function formatByteLength(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} ${byteLength === 1 ? 'byte' : 'bytes'}`;
  const [value, unit] =
    byteLength < MEBIBYTE ? [byteLength / 1024, 'KiB'] : [byteLength / MEBIBYTE, 'MiB'];
  return `${Number.isInteger(value) ? value : value.toFixed(2)} ${unit}`;
}

/** Permite recusar um arquivo pelo tamanho informado pelo navegador, antes de lê-lo. */
export function assertLabInputSize(byteLength: number): void {
  if (byteLength === 0) {
    throw new LabError('EMPTY_INPUT', 'A entrada está vazia: não há símbolos para analisar.');
  }
  if (byteLength > LAB_LIMITS.maxInputByteLength) {
    throw new LabError(
      'INPUT_TOO_LARGE',
      `A entrada tem ${formatByteLength(byteLength)}; o laboratório aceita até ${formatByteLength(LAB_LIMITS.maxInputByteLength)}.`,
    );
  }
}

/** Mesma verificação prévia de `assertLabInputSize`, para arquivos `.huf`. */
export function assertLabContainerSize(byteLength: number): void {
  if (byteLength === 0) {
    throw new LabError('EMPTY_INPUT', 'O arquivo .huf está vazio.');
  }
  if (byteLength > LAB_LIMITS.maxContainerByteLength) {
    throw new LabError(
      'CONTAINER_TOO_LARGE',
      `O arquivo .huf tem ${formatByteLength(byteLength)}; o laboratório aceita até ${formatByteLength(LAB_LIMITS.maxContainerByteLength)}.`,
    );
  }
}

function sameBytes(first: Uint8Array, second: Uint8Array): boolean {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index++) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

/**
 * Executa o codec completo sobre bytes arbitrários: frequências, árvore, códigos, contêiner e
 * decodificação. O resultado só é devolvido se `decode(encode(dados))` reproduzir a entrada.
 */
export function analyzeLabInput(data: Uint8Array): LabAnalysis {
  assertLabInputSize(data.length);

  const build = buildHuffmanTree(data);
  if (build.root === null) {
    throw new LabError('EMPTY_INPUT', 'A entrada está vazia: não há símbolos para analisar.');
  }
  const codeTable = buildCodeTable(build.root);
  const encoded = encode(data, build.root);
  const container = packContainer(encoded);
  const unpacked = unpackContainer(container);
  const restored = decode(unpacked);
  if (!sameBytes(restored, data)) {
    throw new LabError(
      'ROUND_TRIP_FAILED',
      'A decodificação não reproduziu a entrada. Nenhum arquivo foi gerado.',
    );
  }

  let entropyBitsPerSymbol = 0;
  const symbols = build.frequencies.map(({ symbol, weight }) => {
    const relativeFrequency = weight / data.length;
    entropyBitsPerSymbol -= relativeFrequency * Math.log2(relativeFrequency);
    return Object.freeze({
      symbol,
      weight,
      relativeFrequency,
      code: codeTable[symbol] ?? '',
    }) satisfies LabSymbolStat;
  });
  symbols.sort((a, b) => b.weight - a.weight || a.symbol - b.symbol);

  const { metrics } = encoded;
  const effectiveRatio = metrics.totalByteLength / metrics.originalByteLength;

  return Object.freeze({
    originalByteLength: data.length,
    symbols: Object.freeze(symbols),
    tree: build.root,
    mergeHistory: build.history,
    header: unpacked.declared,
    headerBytes: encoded.header,
    metrics,
    rates: Object.freeze({
      averageCodeLength: metrics.payloadBitLength / metrics.originalByteLength,
      entropyBitsPerSymbol,
      payloadRatio: metrics.payloadBitLength / (metrics.originalByteLength * 8),
      effectiveRatio,
      effectiveSavingRatio: 1 - effectiveRatio,
      expands: metrics.totalByteLength > metrics.originalByteLength,
    }),
    container,
    restored,
  });
}

/** Decodifica um arquivo `.huf`, recusando-o antes de alocar a saída se exceder os limites. */
export function restoreLabContainer(container: Uint8Array): LabRestoration {
  assertLabContainerSize(container.length);

  try {
    const unpacked = unpackContainer(container);
    const declaredLength = unpacked.declared.originalByteLength;
    if (declaredLength > LAB_LIMITS.maxInputByteLength) {
      throw new LabError(
        'RESTORED_TOO_LARGE',
        `O cabeçalho declara ${formatByteLength(declaredLength)} de conteúdo original; o laboratório restaura até ${formatByteLength(LAB_LIMITS.maxInputByteLength)}.`,
      );
    }
    return Object.freeze({
      header: unpacked.declared,
      containerByteLength: container.length,
      restored: decode(unpacked),
    });
  } catch (error) {
    if (error instanceof HuffmanCodecError) {
      throw new LabError('INVALID_CONTAINER', `Arquivo .huf inválido: ${error.message}`);
    }
    throw error;
  }
}
