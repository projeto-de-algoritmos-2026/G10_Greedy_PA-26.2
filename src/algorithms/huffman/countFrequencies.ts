import type { FrequencyTable, SymbolFrequency } from './types';

/** Conta ocorrências de bytes e devolve somente símbolos presentes, em ordem crescente. O(n). */
export function countFrequencies(data: Uint8Array): FrequencyTable {
  const counts = new Array<number>(256).fill(0);
  for (const symbol of data) counts[symbol] = (counts[symbol] ?? 0) + 1;

  const frequencies: SymbolFrequency[] = [];
  counts.forEach((weight, symbol) => {
    if (weight > 0) frequencies.push(Object.freeze({ symbol, weight }));
  });
  return Object.freeze(frequencies);
}
