import { describe, expect, it } from 'vitest';
import { EmptyHeapError, MinHeap } from './MinHeap';

const ascending = (a: number, b: number) => a - b;

/** PRNG determinístico (mulberry32) para que os testes aleatórios sejam reproduzíveis. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drain<T>(heap: MinHeap<T>): T[] {
  const result: T[] = [];
  while (!heap.isEmpty()) result.push(heap.pop());
  return result;
}

describe('MinHeap', () => {
  describe('heap vazia', () => {
    it('começa com tamanho zero', () => {
      const heap = new MinHeap(ascending);

      expect(heap.size).toBe(0);
      expect(heap.isEmpty()).toBe(true);
    });

    it('peek e pop lançam EmptyHeapError', () => {
      const heap = new MinHeap(ascending);

      expect(() => heap.peek()).toThrow(EmptyHeapError);
      expect(() => heap.pop()).toThrow(EmptyHeapError);
    });

    it('volta a ser vazia depois de extrair todos os elementos', () => {
      const heap = new MinHeap(ascending, [2, 1]);
      drain(heap);

      expect(heap.isEmpty()).toBe(true);
      expect(() => heap.pop()).toThrow(EmptyHeapError);
    });
  });

  describe('push, peek e pop', () => {
    it('peek devolve o mínimo sem removê-lo', () => {
      const heap = new MinHeap(ascending);
      [5, 3, 8].forEach((value) => heap.push(value));

      expect(heap.peek()).toBe(3);
      expect(heap.size).toBe(3);
    });

    it('pop remove e devolve o mínimo', () => {
      const heap = new MinHeap(ascending, [5, 3, 8]);

      expect(heap.pop()).toBe(3);
      expect(heap.size).toBe(2);
      expect(heap.peek()).toBe(5);
    });

    it('mantém o mínimo na raiz quando um novo mínimo é inserido', () => {
      const heap = new MinHeap(ascending, [4, 6]);
      heap.push(1);

      expect(heap.peek()).toBe(1);
    });

    it('extração repetida produz sequência não decrescente', () => {
      const random = seededRandom(42);
      const heap = new MinHeap(ascending);
      for (let i = 0; i < 1000; i++) heap.push(Math.floor(random() * 200));

      const extracted = drain(heap);

      expect(extracted).toHaveLength(1000);
      expect(extracted).toEqual([...extracted].sort(ascending));
    });

    it('preserva a propriedade da heap em operações intercaladas (modelo de referência)', () => {
      for (const seed of [1, 2, 3, 4, 5]) {
        const random = seededRandom(seed);
        const heap = new MinHeap(ascending);
        const model: number[] = [];

        for (let step = 0; step < 500; step++) {
          if (model.length === 0 || random() < 0.6) {
            const value = Math.floor(random() * 50);
            heap.push(value);
            model.push(value);
            model.sort(ascending);
          } else {
            expect(heap.pop()).toBe(model.shift());
          }
          expect(heap.size).toBe(model.length);
          if (model.length > 0) expect(heap.peek()).toBe(model[0]);
        }
      }
    });
  });

  describe('valores duplicados', () => {
    it('mantém todas as ocorrências', () => {
      const heap = new MinHeap(ascending, [3, 1, 3, 1, 2, 2, 3]);

      expect(drain(heap)).toEqual([1, 1, 2, 2, 3, 3, 3]);
    });

    it('aceita heap inteira de valores iguais', () => {
      const heap = new MinHeap(ascending);
      for (let i = 0; i < 10; i++) heap.push(7);

      expect(drain(heap)).toEqual(Array(10).fill(7));
    });
  });

  describe('construção a partir de uma coleção', () => {
    it('extrai os elementos em ordem', () => {
      const heap = new MinHeap(ascending, [9, 4, 7, 1, 8, 2, 6, 3, 5]);

      expect(heap.size).toBe(9);
      expect(drain(heap)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('não modifica a coleção original', () => {
      const source = [3, 1, 2];
      new MinHeap(ascending, source);

      expect(source).toEqual([3, 1, 2]);
    });

    it('aceita qualquer Iterable', () => {
      const heap = new MinHeap(ascending, new Set([3, 1, 2]));

      expect(drain(heap)).toEqual([1, 2, 3]);
    });

    it('aceita coleção vazia', () => {
      const heap = new MinHeap(ascending, []);

      expect(heap.isEmpty()).toBe(true);
    });

    it('equivale a inserir os elementos um a um', () => {
      const random = seededRandom(7);
      const values = Array.from({ length: 300 }, () => Math.floor(random() * 100));
      const pushed = new MinHeap(ascending);
      values.forEach((value) => pushed.push(value));

      expect(drain(new MinHeap(ascending, values))).toEqual(drain(pushed));
    });
  });

  describe('elementos que admitem undefined', () => {
    it('não confunde undefined armazenado com heap vazia', () => {
      const undefinedFirst = (a: number | undefined, b: number | undefined) =>
        (a ?? -Infinity) - (b ?? -Infinity) || 0;
      const heap = new MinHeap<number | undefined>(undefinedFirst, [3, undefined, 1]);

      expect(drain(heap)).toEqual([undefined, 1, 3]);
    });
  });

  describe('comparador injetável', () => {
    it('permite comparar objetos por uma chave', () => {
      const heap = new MinHeap<{ weight: number; symbol: string }>(
        (a, b) => a.weight - b.weight,
        [
          { weight: 5, symbol: 'e' },
          { weight: 1, symbol: 'a' },
          { weight: 3, symbol: 'c' },
        ],
      );

      expect(drain(heap).map((node) => node.symbol)).toEqual(['a', 'c', 'e']);
    });

    it('comparador invertido transforma a estrutura em max-heap', () => {
      const heap = new MinHeap<number>((a, b) => b - a, [2, 9, 4]);

      expect(drain(heap)).toEqual([9, 4, 2]);
    });
  });

  describe('desempate determinístico', () => {
    type Node = { weight: number; id: string };
    const byWeight = (a: Node, b: Node) => a.weight - b.weight;

    it('elementos empatados saem na ordem de inserção', () => {
      const heap = new MinHeap(byWeight);
      ['a', 'b', 'c', 'd', 'e'].forEach((id) => heap.push({ weight: 1, id }));

      expect(drain(heap).map((node) => node.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('elementos empatados da coleção inicial saem na ordem de iteração', () => {
      const nodes = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ weight: 2, id }));
      const heap = new MinHeap(byWeight, nodes);

      expect(drain(heap).map((node) => node.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    });

    it('empates só são desfeitos entre elementos de mesmo peso', () => {
      const heap = new MinHeap(byWeight, [
        { weight: 2, id: 'x1' },
        { weight: 1, id: 'y1' },
        { weight: 2, id: 'x2' },
        { weight: 1, id: 'y2' },
      ]);
      heap.push({ weight: 1, id: 'y3' });

      expect(drain(heap).map((node) => node.id)).toEqual(['y1', 'y2', 'y3', 'x1', 'x2']);
    });

    it('a saída é idêntica em execuções repetidas com a mesma entrada', () => {
      const random = seededRandom(99);
      const nodes = Array.from({ length: 200 }, (_, i) => ({
        weight: Math.floor(random() * 5),
        id: `n${i}`,
      }));

      const first = drain(new MinHeap(byWeight, nodes)).map((node) => node.id);
      const second = drain(new MinHeap(byWeight, nodes)).map((node) => node.id);

      expect(second).toEqual(first);
      const expected = [...nodes].sort((a, b) => a.weight - b.weight).map((node) => node.id);
      expect(first).toEqual(expected);
    });
  });
});
