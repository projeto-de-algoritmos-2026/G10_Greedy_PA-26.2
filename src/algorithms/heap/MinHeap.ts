/** Define a ordem da heap: negativo se `a` vem antes de `b`, positivo se depois, zero se empatam. */
export type Comparator<T> = (a: T, b: T) => number;

/** Lançado ao consultar ou extrair de uma heap vazia. */
export class EmptyHeapError extends Error {
  constructor() {
    super('Operação inválida: a heap está vazia.');
    this.name = 'EmptyHeapError';
  }
}

/**
 * Fila de prioridade mínima implementada como heap binária em vetor.
 *
 * O nó `i` tem filhos em `2i + 1` e `2i + 2` e pai em `⌊(i - 1) / 2⌋`. Invariante: nenhum
 * filho precede o pai segundo o comparador, então o mínimo fica sempre na raiz.
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
 * O espaço auxiliar é O(1) além do vetor de elementos.
 */
export class MinHeap<T> {
  private readonly items: T[];

  /**
   * @param compare ordem entre elementos; é chamado apenas com elementos já armazenados ou
   *   sendo inseridos.
   * @param initial elementos iniciais. A heap é construída pelo método de Floyd (sift-down
   *   de baixo para cima), em O(n), em vez de `n` inserções em O(n log n). A coleção
   *   original não é modificada.
   */
  constructor(
    private readonly compare: Comparator<T>,
    initial: Iterable<T> = [],
  ) {
    this.items = Array.from(initial);
    for (let index = (this.items.length >> 1) - 1; index >= 0; index--) this.siftDown(index);
  }

  get size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /** Insere `item`. O(log n): entra como folha e sobe até respeitar a invariante. */
  push(item: T): void {
    this.items.push(item);
    this.siftUp(this.items.length - 1);
  }

  /** Devolve o mínimo sem removê-lo. O(1). @throws {EmptyHeapError} se a heap estiver vazia. */
  peek(): T {
    if (this.isEmpty()) throw new EmptyHeapError();
    return this.item(0);
  }

  /**
   * Remove e devolve o mínimo. O(log n): a última folha ocupa a raiz e desce até respeitar a
   * invariante. @throws {EmptyHeapError} se a heap estiver vazia.
   */
  pop(): T {
    const top = this.peek();
    const lastIndex = this.items.length - 1;
    if (lastIndex > 0) {
      this.items[0] = this.item(lastIndex);
      this.items.length = lastIndex;
      this.siftDown(0);
    } else {
      this.items.length = 0;
    }
    return top;
  }

  private item(index: number): T {
    if (index < 0 || index >= this.items.length)
      throw new RangeError(`Índice ${index} fora da heap.`);
    // Índice validado acima; o teste por `undefined` erraria para T que admite `undefined`.
    return this.items[index]!;
  }

  private siftUp(index: number): void {
    const moving = this.item(index);
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const parent = this.item(parentIndex);
      if (this.compare(moving, parent) >= 0) break;
      this.items[index] = parent;
      index = parentIndex;
    }
    this.items[index] = moving;
  }

  private siftDown(index: number): void {
    const moving = this.item(index);
    const firstLeaf = this.items.length >> 1;
    while (index < firstLeaf) {
      let childIndex = 2 * index + 1;
      let child = this.item(childIndex);
      if (childIndex + 1 < this.items.length) {
        const right = this.item(childIndex + 1);
        if (this.compare(right, child) < 0) {
          childIndex += 1;
          child = right;
        }
      }
      if (this.compare(child, moving) >= 0) break;
      this.items[index] = child;
      index = childIndex;
    }
    this.items[index] = moving;
  }
}
