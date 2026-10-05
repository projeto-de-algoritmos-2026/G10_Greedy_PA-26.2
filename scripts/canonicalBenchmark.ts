import os from 'node:os';
import { benchmarkRepresentations } from '../src/algorithms/huffman/canonicalBenchmark';
import type { BenchmarkRow } from '../src/algorithms/huffman/canonicalBenchmark';
import { createSeededRandom, generateByteCorpus } from '../src/test/random';

const SEED = 2026;
const KIB = 1024;
const ALPHABET_256 = Array.from({ length: 256 }, (_, symbol) => symbol);
const alphabetOf = (size: number) => Array.from({ length: size }, (_, index) => index);

interface Corpus {
  readonly label: string;
  readonly data: Uint8Array;
}

/** Frequência ∝ 1/posto: aproxima texto natural, com cauda longa de símbolos raros. */
function zipfCorpus(length: number, symbols: number, seed: number): Uint8Array {
  const random = createSeededRandom(seed);
  const cumulative: number[] = [];
  let total = 0;
  for (let rank = 1; rank <= symbols; rank++) cumulative.push((total += 1 / rank));

  return Uint8Array.from({ length }, () => {
    const target = random() * total;
    const index = cumulative.findIndex((weight) => weight >= target);
    return index < 0 ? symbols - 1 : index;
  });
}

/** Contagens de Fibonacci produzem a árvore mais profunda possível para o total de bytes. */
function fibonacciCorpus(symbols: number): Uint8Array {
  const bytes: number[] = [];
  let [previous, current] = [1, 1];
  for (let symbol = 0; symbol < symbols; symbol++) {
    for (let count = 0; count < previous; count++) bytes.push(symbol);
    [previous, current] = [current, previous + current];
  }
  return Uint8Array.from(bytes);
}

const corpus = (
  label: string,
  alphabetSize: number,
  length: number,
  distribution: 'uniform' | 'skewed' | 'tied',
): Corpus => ({
  label,
  data: generateByteCorpus({
    alphabet: alphabetSize === 256 ? ALPHABET_256 : alphabetOf(alphabetSize),
    length,
    distribution,
    seed: SEED,
  }),
});

const distributions: readonly Corpus[] = [
  { label: 'vazio', data: new Uint8Array() },
  { label: 'texto curto (13 B)', data: new TextEncoder().encode('hello huffman') },
  { label: 'símbolo único 4 KiB', data: new Uint8Array(4 * KIB).fill(0x41) },
  corpus('2 símbolos, uniforme, 64 KiB', 2, 64 * KIB, 'uniform'),
  corpus('16 símbolos, uniforme, 64 KiB', 16, 64 * KIB, 'uniform'),
  corpus('64 símbolos, enviesado, 64 KiB', 64, 64 * KIB, 'skewed'),
  corpus('256 símbolos, enviesado, 64 KiB', 256, 64 * KIB, 'skewed'),
  { label: 'Zipf 256 símbolos, 64 KiB', data: zipfCorpus(64 * KIB, 256, SEED) },
  { label: 'Fibonacci 24 símbolos', data: fibonacciCorpus(24) },
  corpus('256 símbolos, uniforme, 64 KiB', 256, 64 * KIB, 'uniform'),
  corpus('256 símbolos, empatado, 64 KiB', 256, 64 * KIB, 'tied'),
];

/** Mesma distribuição (16 símbolos, enviesada) em tamanhos crescentes: acha o ponto de equilíbrio. */
const sizeSweep: readonly Corpus[] = [32, 64, 128, 256, 512, KIB, 4 * KIB].map((length) =>
  corpus(`16 símbolos, enviesado, ${length} B`, 16, length, 'skewed'),
);

/**
 * Memória retida por instância, em média de várias cópias; exige `node --expose-gc`. Soma
 * `arrayBuffers` porque o conteúdo de typed arrays grandes fica fora do heap do V8.
 */
function measureRetainedBytes(build: () => unknown): number | null {
  const collect = globalThis.gc;
  if (typeof collect !== 'function') return null;

  const copies = 1000;
  const used = () => {
    const { heapUsed, arrayBuffers } = process.memoryUsage();
    return heapUsed + arrayBuffers;
  };
  collect();
  const before = used();
  const kept = Array.from({ length: copies }, build);
  collect();
  const after = used();
  return kept.length === copies ? Math.max(0, Math.round((after - before) / copies)) : null;
}

const percent = (part: number, whole: number) =>
  whole === 0 ? '—' : `${((part / whole) * 100).toFixed(1)}%`;
const ms = (value: number) => value.toFixed(3);
const bytes = (value: number | null) => (value === null ? 'n/d' : String(value));

function sizeTable(rows: readonly BenchmarkRow[]): string {
  const lines = [
    '| Caso | Original (B) | σ | Lmax | Cab. árvore (B) | Cab. canônico (B) | Economia no cab. (B) | Payload (B) | Total árvore (B) | Total canônico (B) | Canônico / original | Observação |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  ];
  for (const row of rows) {
    const expansion = row.canonicalExpandsData
      ? row.treeExpandsData
        ? 'ambos expandem'
        : 'canônico expande'
      : row.treeExpandsData
        ? 'só a árvore expande'
        : '';
    const notes = [expansion, row.canonicalHeaderExceedsPayloadSaving ? 'cab. > economia' : ''];
    lines.push(
      `| ${row.label} | ${row.originalBytes} | ${row.distinctSymbols} | ${row.maxCodeLength} | ` +
        `${row.tree.headerBytes} | ${row.canonical.headerBytes} | ${row.headerSavingBytes} | ` +
        `${row.canonical.payloadBytes} | ${row.tree.totalBytes} | ${row.canonical.totalBytes} | ` +
        `${percent(row.canonical.totalBytes, row.originalBytes)} | ` +
        `${notes.filter(Boolean).join('; ') || '—'} |`,
    );
  }
  return lines.join('\n');
}

function costTable(rows: readonly BenchmarkRow[]): string {
  const lines = [
    '| Caso | Codif. árvore (ms) | Codif. canônico (ms) | Decodif. árvore (ms) | Decodif. canônico (ms) | Estrutura árvore (B) | Estrutura canônica (B) |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const { label, tree, canonical } of rows) {
    lines.push(
      `| ${label} | ${ms(tree.encodeMs)} | ${ms(canonical.encodeMs)} | ${ms(tree.decodeMs)} | ` +
        `${ms(canonical.decodeMs)} | ${bytes(tree.decoderStructureBytes)} | ` +
        `${bytes(canonical.decoderStructureBytes)} |`,
    );
  }
  return lines.join('\n');
}

function parseIterations(args: readonly string[]): number | undefined {
  const index = args.indexOf('--iterations');
  if (index < 0) return undefined;
  const value = Number(args[index + 1]);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('--iterations exige um inteiro positivo.');
  }
  return value;
}

export function main(args: readonly string[]): void {
  const iterations = parseIterations(args);
  const options = { ...(iterations === undefined ? {} : { iterations }), measureRetainedBytes };
  const run = (cases: readonly Corpus[]) =>
    cases.map(({ label, data }) => benchmarkRepresentations(label, data, options));

  const distributionRows = run(distributions);
  const sweepRows = run(sizeSweep);

  console.log(`# Benchmark Huffman canônico (semente ${SEED})\n`);
  console.log(
    `- Node ${process.version} · ${os.platform()} ${os.arch()} · ${os.cpus()[0]?.model ?? 'CPU desconhecida'}`,
  );
  console.log(
    `- Mediana de ${iterations ?? 15} execuções por operação; memória ` +
      `${typeof globalThis.gc === 'function' ? 'medida com --expose-gc' : 'indisponível (execute com --expose-gc)'}.\n`,
  );
  console.log('## Tamanhos por distribuição (determinísticos)\n');
  console.log(sizeTable(distributionRows));
  console.log('\n## Tamanhos por quantidade de dados\n');
  console.log(sizeTable(sweepRows));
  console.log('\n## Tempo e memória por distribuição (dependem da máquina)\n');
  console.log(costTable(distributionRows));
  console.log('\n## Tempo e memória por quantidade de dados\n');
  console.log(costTable(sweepRows));
}
