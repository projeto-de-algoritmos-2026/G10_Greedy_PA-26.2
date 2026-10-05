// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { generateByteCorpus } from '../../test/random';
import { benchmarkRepresentations } from './canonicalBenchmark';

/** Relógio que avança 1 ms por leitura: elimina a variação de tempo real nos testes. */
const steppingClock = () => {
  let tick = 0;
  return () => tick++;
};

const options = { iterations: 3, warmupIterations: 1 } as const;

describe('benchmarkRepresentations', () => {
  it('reporta tamanhos exatos e payload igual nas duas representações', () => {
    const data = generateByteCorpus({
      alphabet: Array.from({ length: 64 }, (_, index) => index),
      length: 8192,
      distribution: 'skewed',
      seed: 501,
    });
    const row = benchmarkRepresentations('enviesado', data, { ...options, now: steppingClock() });

    expect(row.originalBytes).toBe(8192);
    expect(row.distinctSymbols).toBe(64);
    expect(row.canonical.payloadBytes).toBe(row.tree.payloadBytes);
    expect(row.tree.totalBytes).toBe(row.tree.headerBytes + row.tree.payloadBytes);
    // Árvore: 13 + 7n − 1 bytes; canônico: 16 + (Lmax − 1) + n bytes.
    expect(row.tree.headerBytes).toBe(13 + 7 * 64 - 1);
    expect(row.canonical.headerBytes).toBe(16 + (row.maxCodeLength - 1) + 64);
    expect(row.headerSavingBytes).toBe(row.tree.headerBytes - row.canonical.headerBytes);
    expect(row.headerSavingBytes).toBeGreaterThan(0);
  });

  it('é determinístico quando o relógio e a medição de memória são injetados', () => {
    const data = generateByteCorpus({
      alphabet: [1, 2, 3, 4],
      length: 400,
      distribution: 'uniform',
      seed: 502,
    });
    const run = () =>
      benchmarkRepresentations('fixo', data, {
        ...options,
        now: steppingClock(),
        measureRetainedBytes: () => 1234,
      });
    expect(run()).toEqual(run());
    expect(run().canonical.decoderStructureBytes).toBe(1234);
    expect(run().tree.encodeMs).toBe(1);
  });

  it('marca memória como indisponível quando não há medidor', () => {
    const row = benchmarkRepresentations('sem memória', Uint8Array.of(1, 2, 3), options);
    expect(row.tree.decoderStructureBytes).toBeNull();
    expect(row.canonical.decoderStructureBytes).toBeNull();
  });

  it('detecta entrada pequena em que o cabeçalho supera a economia', () => {
    const row = benchmarkRepresentations(
      'curto',
      new TextEncoder().encode('hello huffman'),
      options,
    );
    expect(row.canonicalExpandsData).toBe(true);
    expect(row.canonicalHeaderExceedsPayloadSaving).toBe(true);
  });

  it('detecta dado quase incompressível (256 símbolos uniformes)', () => {
    const data = generateByteCorpus({
      alphabet: Array.from({ length: 256 }, (_, symbol) => symbol),
      length: 4096,
      distribution: 'tied',
      seed: 503,
    });
    const row = benchmarkRepresentations('uniforme', data, options);
    expect(row.canonical.payloadBytes).toBe(4096); // 8 bits por símbolo: nenhuma economia.
    expect(row.canonicalExpandsData).toBe(true);
  });

  it('não marca expansão quando a compressão compensa o cabeçalho', () => {
    const row = benchmarkRepresentations('repetitivo', new Uint8Array(10_000).fill(7), options);
    expect(row.canonicalExpandsData).toBe(false);
    expect(row.canonicalHeaderExceedsPayloadSaving).toBe(false);
  });

  it('trata entrada vazia', () => {
    const row = benchmarkRepresentations('vazio', new Uint8Array(), options);
    expect(row.distinctSymbols).toBe(0);
    expect(row.maxCodeLength).toBe(0);
    expect(row.tree.headerBytes).toBe(14);
    expect(row.canonical.headerBytes).toBe(15);
    expect(row.headerSavingBytes).toBe(-1);
  });
});
