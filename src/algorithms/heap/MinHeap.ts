/** Define a ordem da heap: negativo se `a` vem antes de `b`, positivo se depois, zero se empatam. */
export type Comparator<T> = (a: T, b: T) => number;

/** Lançado ao consultar ou extrair de uma heap vazia. */
export class EmptyHeapError extends Error {
  constructor() {
    super('Operação inválida: a heap está vazia.');
    this.name = 'EmptyHeapError';
  }
}

/** Elemento armazenado junto de sua posição de chegada, usada para desempatar. */
interface Entry<T> {
  readonly value: T;
  readonly order: number;
}

/**
 * Fila de prioridade mínima implementada como heap binária em vetor.
 *
 * O nó `i` tem filhos em `2i + 1` e `2i + 2` e pai em `⌊(i - 1) / 2⌋`. Invariante: nenhum
 * filho precede o pai, então o mínimo fica sempre na raiz.
 *
 * **Desempate determinístico.** Uma heap binária não é estável: elementos que o comparador
 * considera iguais poderiam sair em qualquer ordem. Para que a construção da árvore de
 * Huffman seja reproduzível, cada elemento recebe um número de chegada (a ordem de iteração
 * da coleção inicial, depois a ordem dos `push`) e, quando o comparador retorna zero, sai
 * primeiro quem chegou antes (FIFO entre iguais). O resultado depende só da sequência de
 * operações, nunca do layout interno do vetor.
 *
 * Complexidade, com `n` elementos:
 *
 * | operação                  | tempo      |
 * |---------------------------|------------|
 * | `size`, `isEmpty`, `peek` | O(1)       |
 * | `push`                    | O(log n)   |
 * | `pop`                     | O(log n)   |
 * | construção de `n` itens   | O(n)       |
 *
 * O número de chegada custa O(1) por elemento; o espaço é O(n).
 */
export class MinHeap<T> {
  private readonly entries: Entry<T>[];
  private nextOrder = 0;

  /**
   * @param compare ordem entre elementos; empates são resolvidos pela ordem de chegada.
   * @param initial elementos iniciais, numerados na ordem de iteração. A heap é construída
   *   pelo método de Floyd (sift-down de baixo para cima), em O(n), em vez de `n` inserções
   *   em O(n log n). A coleção original não é modificada.
   */
  constructor(
    private readonly compare: Comparator<T>,
    initial: Iterable<T> = [],
  ) {
    this.entries = Array.from(initial, (value) => this.wrap(value));
    for (let index = (this.entries.length >> 1) - 1; index >= 0; index--) this.siftDown(index);
  }

  get size(): number {
    return this.entries.length;
  }

  isEmpty(): boolean {
    return this.entries.length === 0;
  }

  /** Insere `item`. O(log n): entra como folha e sobe até respeitar a invariante. */
  push(item: T): void {
    this.entries.push(this.wrap(item));
    this.siftUp(this.entries.length - 1);
  }

  /** Devolve o mínimo sem removê-lo. O(1). @throws {EmptyHeapError} se a heap estiver vazia. */
  peek(): T {
    if (this.isEmpty()) throw new EmptyHeapError();
    return this.entry(0).value;
  }

  /**
   * Remove e devolve o mínimo. O(log n): a última folha ocupa a raiz e desce até respeitar a
   * invariante. @throws {EmptyHeapError} se a heap estiver vazia.
   */
  pop(): T {
    const top = this.peek();
    const lastIndex = this.entries.length - 1;
    if (lastIndex > 0) {
      this.entries[0] = this.entry(lastIndex);
      this.entries.length = lastIndex;
      this.siftDown(0);
    } else {
      this.entries.length = 0;
    }
    return top;
  }

  private wrap(value: T): Entry<T> {
    return { value, order: this.nextOrder++ };
  }

  private entry(index: number): Entry<T> {
    const entry = this.entries[index];
    if (entry === undefined) throw new RangeError(`Índice ${index} fora da heap.`);
    return entry;
  }

  /** Ordem total: comparador primeiro, chegada como desempate. */
  private precedes(a: Entry<T>, b: Entry<T>): boolean {
    const order = this.compare(a.value, b.value);
    return order < 0 || (order === 0 && a.order < b.order);
  }

  private siftUp(index: number): void {
    const moving = this.entry(index);
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const parent = this.entry(parentIndex);
      if (!this.precedes(moving, parent)) break;
      this.entries[index] = parent;
      index = parentIndex;
    }
    this.entries[index] = moving;
  }

  private siftDown(index: number): void {
    const moving = this.entry(index);
    const firstLeaf = this.entries.length >> 1;
    while (index < firstLeaf) {
      let childIndex = 2 * index + 1;
      let child = this.entry(childIndex);
      if (childIndex + 1 < this.entries.length) {
        const right = this.entry(childIndex + 1);
        if (this.precedes(right, child)) {
          childIndex += 1;
          child = right;
        }
      }
      if (!this.precedes(child, moving)) break;
      this.entries[index] = child;
      index = childIndex;
    }
    this.entries[index] = moving;
  }
}
