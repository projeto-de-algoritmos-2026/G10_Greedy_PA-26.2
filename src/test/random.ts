/** PRNG Mulberry32: rápido, determinístico e suficiente para geração de casos de teste. */
export function createSeededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Inteiro no intervalo [0, upperBound), usando a fonte pseudoaleatória informada. */
export function randomInteger(random: () => number, upperBound: number): number {
  if (!Number.isSafeInteger(upperBound) || upperBound <= 0) {
    throw new RangeError('O limite superior deve ser um inteiro positivo.');
  }
  return Math.floor(random() * upperBound);
}

export type ByteDistribution = 'uniform' | 'skewed' | 'tied';

interface ByteCorpusOptions {
  readonly alphabet: readonly number[];
  readonly length: number;
  readonly distribution: ByteDistribution;
  readonly seed: number;
}

/**
 * Gera um corpus de bytes reprodutível e garante que todo símbolo do alfabeto apareça.
 * `skewed` concentra aproximadamente 80% das escolhas no primeiro símbolo; `tied` mantém
 * frequências tão próximas quanto possível.
 */
export function generateByteCorpus({
  alphabet,
  length,
  distribution,
  seed,
}: ByteCorpusOptions): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError('O tamanho do corpus deve ser um inteiro não negativo.');
  }
  if (new Set(alphabet).size !== alphabet.length) {
    throw new RangeError('O alfabeto não pode conter símbolos duplicados.');
  }
  if (alphabet.some((symbol) => !Number.isInteger(symbol) || symbol < 0 || symbol > 255)) {
    throw new RangeError('Todo símbolo deve ser um byte entre 0 e 255.');
  }
  if (alphabet.length === 0) {
    if (length !== 0) throw new RangeError('Um corpus não vazio exige um alfabeto.');
    return new Uint8Array();
  }
  if (length < alphabet.length) {
    throw new RangeError('O corpus deve comportar todos os símbolos do alfabeto.');
  }

  const random = createSeededRandom(seed);
  const values = new Uint8Array(length);
  alphabet.forEach((symbol, index) => {
    values[index] = symbol;
  });

  for (let index = alphabet.length; index < values.length; index++) {
    let alphabetIndex: number;
    if (distribution === 'tied') {
      alphabetIndex = index % alphabet.length;
    } else if (distribution === 'skewed' && random() < 0.8) {
      alphabetIndex = 0;
    } else {
      alphabetIndex = randomInteger(random, alphabet.length);
    }
    values[index] = alphabet[alphabetIndex] ?? 0;
  }

  // Embaralha inclusive os símbolos obrigatórios para não privilegiar uma ordem de entrada.
  for (let index = values.length - 1; index > 0; index--) {
    const other = randomInteger(random, index + 1);
    const currentValue = values[index];
    values[index] = values[other] ?? 0;
    values[other] = currentValue ?? 0;
  }
  return values;
}
