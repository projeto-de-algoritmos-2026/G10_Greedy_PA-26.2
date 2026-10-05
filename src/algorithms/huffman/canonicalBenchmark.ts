import { buildHuffmanTree, buildHuffmanTreeFromFrequencies } from './buildTree';
import { buildCanonicalDecoder, deriveCodeLengths } from './canonical';
import { decodeCanonical, encodeCanonical } from './canonicalCodec';
import { decode, encode } from './codec';
import type { EncodedHuffmanData } from './types';

export interface BenchmarkOptions {
  /** Execuções cronometradas por operação; a mediana é reportada. */
  readonly iterations?: number;
  /** Execuções descartadas antes de cronometrar, para estabilizar o JIT. */
  readonly warmupIterations?: number;
  /** Relógio em milissegundos; injetável para testes determinísticos. */
  readonly now?: () => number;
  /**
   * Bytes retidos por uma instância da estrutura devolvida por `build`, ou `null` quando o
   * ambiente não consegue medir. A medição de heap depende do runtime, por isso é injetada.
   */
  readonly measureRetainedBytes?: (build: () => unknown) => number | null;
}

export interface RepresentationMeasurement {
  readonly headerBytes: number;
  readonly payloadBytes: number;
  readonly totalBytes: number;
  readonly encodeMs: number;
  readonly decodeMs: number;
  /** Memória retida pela estrutura de decodificação (árvore ou tabelas canônicas). */
  readonly decoderStructureBytes: number | null;
}

export interface BenchmarkRow {
  readonly label: string;
  readonly originalBytes: number;
  readonly distinctSymbols: number;
  readonly maxCodeLength: number;
  readonly tree: RepresentationMeasurement;
  readonly canonical: RepresentationMeasurement;
  /** Bytes de cabeçalho economizados pela forma canônica (negativo = ela custa mais). */
  readonly headerSavingBytes: number;
  /** `true` se `cabeçalho ‖ payload` com árvore explícita é maior que o dado original. */
  readonly treeExpandsData: boolean;
  /** `true` se o arquivo canônico completo é maior que o dado original. */
  readonly canonicalExpandsData: boolean;
  /** `true` se o cabeçalho sozinho consome mais que a economia obtida no payload. */
  readonly canonicalHeaderExceedsPayloadSaving: boolean;
}

const DEFAULT_ITERATIONS = 15;
const DEFAULT_WARMUP = 3;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Cronometra `action` e devolve a mediana; o último resultado serve para conferir a ida e volta. */
function timeMedian<T>(action: () => T, iterations: number, warmup: number, now: () => number) {
  let result: T | undefined;
  for (let run = 0; run < warmup; run++) result = action();
  const samples: number[] = [];
  for (let run = 0; run < iterations; run++) {
    const start = now();
    result = action();
    samples.push(now() - start);
  }
  return { ms: median(samples), result: result as T };
}

/**
 * Compara a árvore explícita (`HUF`) com a tabela canônica (`HUC`) para um mesmo dado. Cada
 * representação é decodificada e comparada ao original; divergência interrompe o benchmark,
 * pois um número de uma implementação incorreta não teria significado.
 */
export function benchmarkRepresentations(
  label: string,
  data: Uint8Array,
  options: BenchmarkOptions = {},
): BenchmarkRow {
  const {
    iterations = DEFAULT_ITERATIONS,
    warmupIterations = DEFAULT_WARMUP,
    now = () => performance.now(),
    measureRetainedBytes = () => null,
  } = options;

  const measure = (
    encodeFn: (bytes: Uint8Array) => EncodedHuffmanData,
    decodeFn: (encoded: EncodedHuffmanData) => Uint8Array,
    decoderStructure: () => unknown,
  ): RepresentationMeasurement => {
    const encodeRun = timeMedian(() => encodeFn(data), iterations, warmupIterations, now);
    const encoded = encodeRun.result;
    const decodeRun = timeMedian(() => decodeFn(encoded), iterations, warmupIterations, now);
    if (!sameBytes(decodeRun.result, data)) {
      throw new Error(`A ida e volta divergiu no caso "${label}".`);
    }
    return Object.freeze({
      headerBytes: encoded.metrics.headerByteLength,
      payloadBytes: encoded.metrics.payloadByteLength,
      totalBytes: encoded.metrics.totalByteLength,
      encodeMs: encodeRun.ms,
      decodeMs: decodeRun.ms,
      decoderStructureBytes: measureRetainedBytes(decoderStructure),
    });
  };

  const reference = buildHuffmanTree(data);
  const lengths = deriveCodeLengths(reference.root);
  const tree = measure(
    (bytes) => encode(bytes),
    decode,
    () => buildHuffmanTreeFromFrequencies(reference.frequencies).root,
  );
  const canonical = measure(
    (bytes) => encodeCanonical(bytes),
    decodeCanonical,
    () => buildCanonicalDecoder(lengths),
  );

  const payloadSaving = data.length - canonical.payloadBytes;
  return Object.freeze({
    label,
    originalBytes: data.length,
    distinctSymbols: lengths.length,
    maxCodeLength: Math.max(0, ...lengths.map(({ length }) => length)),
    tree,
    canonical,
    headerSavingBytes: tree.headerBytes - canonical.headerBytes,
    treeExpandsData: tree.totalBytes > data.length,
    canonicalExpandsData: canonical.totalBytes > data.length,
    canonicalHeaderExceedsPayloadSaving: canonical.headerBytes > payloadSaving,
  });
}
