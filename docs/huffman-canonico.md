# Huffman canônico e benchmarks

O codec principal ([formato `HUF`](formato-huffman.md)) grava no cabeçalho a
**árvore explícita**: 6 bytes por folha (símbolo + frequência) mais 1 byte por nó
interno. O Huffman canônico troca essa árvore por uma tabela de **comprimentos de
código** e reconstrói os códigos por regra. Este documento descreve a
representação, o formato `HUC` e o que foi medido.

## Ideia

Todas as árvores de Huffman com os mesmos comprimentos de código comprimem
exatamente o mesmo número de bits. Só os comprimentos importam para o tamanho do
payload; a topologia (qual folha fica à esquerda) é arbitrária. O código canônico
fixa essa escolha:

1. ordenar os símbolos por `(comprimento, símbolo)`;
2. o primeiro código é uma sequência de zeros;
3. cada código seguinte é o anterior `+ 1`, deslocado à esquerda quando o
   comprimento aumenta.

Exemplo com comprimentos `B=1, A=2, C=3, D=3`:

| Símbolo | Comprimento | Código |
|---|---:|---|
| B | 1 | `0` |
| A | 2 | `10` |
| C | 3 | `110` |
| D | 3 | `111` |

Um único símbolo usa o código `0`, igual à tabela derivada da árvore. Os códigos
podem ter até 255 bits (árvore montada à mão, em cadeia), então a atribuição usa
`BigInt`; o cálculo é feito uma vez por tabela (≤ 256 símbolos).

## Formato `HUC` v1

Mesmos campos fixos de 13 bytes do `HUF` (inteiros de 32 bits em big-endian), com
assinatura ASCII `HUC` e a tabela no lugar da árvore:

| Campo | Tamanho | Descrição |
|---|---:|---|
| assinatura | 3 bytes | ASCII `HUC` |
| versão | 1 byte | atualmente `1` |
| tamanho original | 4 bytes | bytes antes da compressão |
| bits úteis | 4 bytes | bits do payload sem padding |
| padding | 1 byte | de `0` a `7` |
| símbolos `n` | 2 bytes | de `0` a `256` |
| `Lmax` | 1 byte | maior comprimento; ausente se `n = 0` |
| contagens | `Lmax − 1` bytes | quantos códigos têm comprimento `1 … Lmax−1` |
| símbolos | `n` bytes | em ordem canônica (comprimento, depois símbolo) |

A contagem do comprimento `Lmax` é implícita (`n − Σ demais`). Isso evita um
campo de 2 bytes para o caso `n = 256` com todos os códigos de 8 bits (a
contagem 256 não cabe em `u8`).

Tamanho do cabeçalho: `15 + Lmax + n` bytes (`n ≥ 1`) ou `15` (vazio). O da
árvore explícita é `7n + 12` (`n ≥ 1`) ou `14` (vazio). A economia é
`6n − 3 − Lmax` bytes; a única entrada em que o canônico é maior é a vazia
(+1 byte).

`decodeCanonical` recusa assinatura/versão inválidas, tabela truncada, símbolo
repetido, grupo fora de ordem canônica, comprimentos que violam Kraft ou deixam
código incompleto (Huffman sempre gera código completo; a exceção é o símbolo
isolado de 1 bit) e bytes sobrando depois da tabela, além das mesmas verificações
de payload do `HUF`.

## Decodificação sem árvore

O decodificador guarda apenas `counts[l]` (quantos códigos têm comprimento `l`) e
os símbolos em ordem canônica. Lê um bit por vez mantendo `offset = código −
primeiro código do comprimento`; se `offset < counts[l]`, o símbolo está em
`símbolos[base + offset]`, senão `base += counts[l]` e `offset = 2 · (offset −
counts[l])`. Manter o valor relativo evita aritmética de 255 bits. É a técnica
do `puff.c` (zlib), com custo `O(Lmax)` por símbolo.

## API

Em `src/algorithms/huffman`:

- `deriveCodeLengths(árvore)`, `validateCodeLengths(comprimentos)`;
- `buildCanonicalCodeTable(comprimentos)` e `buildCanonicalCodeTableFromTree`;
- `serializeCanonicalTable` / `deserializeCanonicalTable(bytes, offset)`;
- `buildCanonicalDecoder` e `createCanonicalSymbolReader`;
- `encodeCanonical(dados, árvore?)` / `decodeCanonical({ header, payload })`;
- `benchmarkRepresentations(rótulo, dados, opções)` (medição; usada pelo script).

O container `.huf` e o modo laboratório continuam usando `HUF`; o `HUC` é uma
representação alternativa para comparação, ainda não exposta na interface.

## Como reproduzir

```bash
npm run bench:canonical                    # 15 execuções por operação
npm run bench:canonical -- --iterations 31
```

O script (`scripts/canonicalBenchmark.ts`) usa a semente fixa `2026`, confere a
ida e volta de cada caso nas duas representações e imprime tabelas em Markdown.
Tamanhos são determinísticos: duas execuções geraram tabelas idênticas. Tempo e
memória dependem da máquina.

- **Tempo:** mediana de `N` execuções (após 3 de aquecimento) de `encode` /
  `decode` completos. A codificação inclui a construção da árvore nas duas
  representações; a decodificação inclui a leitura do cabeçalho.
- **Memória:** `heapUsed + arrayBuffers` retidos por uma estrutura de
  decodificação, em média de 1000 cópias, com `gc()` antes e depois (por isso o
  script roda com `--expose-gc`). Árvore: nós reconstruídos da tabela de
  frequências. Canônico: `counts` + `symbols`. Não mede o pico durante a
  decodificação.

## Resultados

Execução com Node v26.8.1, linux x64, 12th Gen Intel(R) Core(TM) i7-1255U,
mediana de 31 execuções. `σ` é o número de símbolos distintos e `Lmax` o maior
comprimento de código.

### Tamanhos por distribuição

| Caso | Original (B) | σ | Lmax | Cab. árvore (B) | Cab. canônico (B) | Economia no cab. (B) | Payload (B) | Total árvore (B) | Total canônico (B) | Canônico / original | Observação |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| vazio | 0 | 0 | 0 | 14 | 15 | -1 | 0 | 14 | 15 | — | ambos expandem; cab. > economia |
| texto curto (13 B) | 13 | 10 | 4 | 82 | 29 | 53 | 6 | 88 | 35 | 269.2% | ambos expandem; cab. > economia |
| símbolo único 4 KiB | 4096 | 1 | 1 | 19 | 17 | 2 | 512 | 531 | 529 | 12.9% | — |
| 2 símbolos, uniforme, 64 KiB | 65536 | 2 | 1 | 26 | 18 | 8 | 8192 | 8218 | 8210 | 12.5% | — |
| 16 símbolos, uniforme, 64 KiB | 65536 | 16 | 4 | 124 | 35 | 89 | 32768 | 32892 | 32803 | 50.1% | — |
| 64 símbolos, enviesado, 64 KiB | 65536 | 64 | 7 | 460 | 86 | 374 | 17745 | 18205 | 17831 | 27.2% | — |
| 256 símbolos, enviesado, 64 KiB | 65536 | 256 | 9 | 1804 | 280 | 1524 | 21269 | 23073 | 21549 | 32.9% | — |
| Zipf 256 símbolos, 64 KiB | 65536 | 256 | 11 | 1804 | 282 | 1522 | 51199 | 53003 | 51481 | 78.6% | — |
| Fibonacci 24 símbolos | 121392 | 24 | 23 | 180 | 62 | 118 | 39723 | 39903 | 39785 | 32.8% | — |
| 256 símbolos, uniforme, 64 KiB | 65536 | 256 | 8 | 1804 | 279 | 1525 | 65536 | 67340 | 65815 | 100.4% | ambos expandem; cab. > economia |
| 256 símbolos, empatado, 64 KiB | 65536 | 256 | 8 | 1804 | 279 | 1525 | 65536 | 67340 | 65815 | 100.4% | ambos expandem; cab. > economia |

### Tamanhos por quantidade de dados

Mesma distribuição (16 símbolos, 80% das ocorrências no primeiro), só o
tamanho muda:

| Caso | Original (B) | σ | Lmax | Cab. árvore (B) | Cab. canônico (B) | Economia no cab. (B) | Payload (B) | Total árvore (B) | Total canônico (B) | Canônico / original | Observação |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 16 símbolos, enviesado, 32 B | 32 | 16 | 5 | 124 | 36 | 88 | 12 | 136 | 48 | 150.0% | ambos expandem; cab. > economia |
| 16 símbolos, enviesado, 64 B | 64 | 16 | 6 | 124 | 37 | 87 | 20 | 144 | 57 | 89.1% | só a árvore expande |
| 16 símbolos, enviesado, 128 B | 128 | 16 | 6 | 124 | 37 | 87 | 35 | 159 | 72 | 56.3% | só a árvore expande |
| 16 símbolos, enviesado, 256 B | 256 | 16 | 6 | 124 | 37 | 87 | 62 | 186 | 99 | 38.7% | — |
| 16 símbolos, enviesado, 512 B | 512 | 16 | 6 | 124 | 37 | 87 | 118 | 242 | 155 | 30.3% | — |
| 16 símbolos, enviesado, 1024 B | 1024 | 16 | 6 | 124 | 37 | 87 | 229 | 353 | 266 | 26.0% | — |
| 16 símbolos, enviesado, 4096 B | 4096 | 16 | 5 | 124 | 36 | 88 | 901 | 1025 | 937 | 22.9% | — |

### Tempo e memória por distribuição

| Caso | Codif. árvore (ms) | Codif. canônico (ms) | Decodif. árvore (ms) | Decodif. canônico (ms) | Estrutura árvore (B) | Estrutura canônica (B) |
|---|---:|---:|---:|---:|---:|---:|
| vazio | 0.026 | 0.033 | 0.007 | 0.008 | 0 | 463 |
| texto curto (13 B) | 0.177 | 0.385 | 0.048 | 0.113 | 1614 | 512 |
| símbolo único 4 KiB | 0.671 | 0.470 | 0.292 | 0.921 | 76 | 505 |
| 2 símbolos, uniforme, 64 KiB | 5.702 | 6.981 | 7.329 | 5.205 | 223 | 505 |
| 16 símbolos, uniforme, 64 KiB | 16.253 | 15.614 | 27.604 | 18.880 | 2652 | 502 |
| 64 símbolos, enviesado, 64 KiB | 11.196 | 10.651 | 14.382 | 13.601 | 11095 | 540 |
| 256 símbolos, enviesado, 64 KiB | 12.244 | 12.862 | 14.007 | 14.549 | 44864 | 732 |
| Zipf 256 símbolos, 64 KiB | 33.355 | 38.113 | 35.857 | 41.671 | 44782 | 731 |
| Fibonacci 24 símbolos | 20.235 | 13.157 | 22.928 | 33.526 | 3828 | 538 |
| 256 símbolos, uniforme, 64 KiB | 37.445 | 31.602 | 40.851 | 58.814 | 44878 | 729 |
| 256 símbolos, empatado, 64 KiB | 30.954 | 38.138 | 56.062 | 42.774 | 44166 | 729 |

Em tempo **não há vencedor**. Foram feitas duas execuções idênticas (31 medianas
cada; a tabela acima é a primeira). Comparando as razões canônico/árvore, a
direção da diferença se repetiu em 7 de 11 casos na codificação e em 7 de 11 na
decodificação, e mudou nos demais. Nos casos de 64 KiB ou mais com direção
repetida, a razão na decodificação ficou entre 0,63x e 1,51x: mais rápida em "16
símbolos, uniforme" (0,68x e 0,63x) e "256 símbolos, empatado" (0,76x e 0,86x),
mais lenta em "Fibonacci" (1,46x e 1,51x), "256 símbolos, uniforme" (1,44x e
1,08x) e "256 símbolos, enviesado" (1,04x e 1,14x). Na codificação, a razão ficou
entre 0,65x e 1,23x. A mesma configuração variou muito entre execuções (a
decodificação canônica de "64 símbolos, enviesado" levou 13,6 ms e 19,7 ms). Não
foi investigada a causa das diferenças.

Em memória o efeito é estável nas duas execuções: a árvore cresce com `σ`
(aproximadamente 88 bytes por nó; 44,8 KB para `σ = 256`), enquanto as tabelas
canônicas ficam em torno de 0,5 a 0,7 KB, quase constante.

## Quando o overhead supera a economia

O cabeçalho é um custo fixo, pago uma vez por arquivo; o payload é proporcional
ao dado. Casos medidos acima em que o cabeçalho pesa mais que o ganho:

- **Dado pequeno.** Em "texto curto" (13 B), o arquivo tem 88 B com árvore e 35 B
  no canônico: ambos maiores que o original. Com a distribuição enviesada de 16
  símbolos, o canônico passa a comprimir entre 32 B e 64 B (48 B contra 57 B);
  a árvore, só entre 128 B e 256 B (159 B contra 186 B). O canônico adianta o
  ponto de equilíbrio porque reduz o custo fixo, não porque comprime melhor o
  payload.
- **Distribuição sem concentração.** Com 256 símbolos equiprováveis cada código
  tem 8 bits: o payload tem os mesmos 65.536 B do original e o cabeçalho
  (1.804 B na árvore, 279 B no canônico) é perda pura. O arquivo canônico fica
  com 100,4% do original; com árvore, 102,8%.
- **Entrada vazia.** É o único caso em que o canônico paga mais no cabeçalho
  (15 contra 14 bytes), por causa do campo `n` de 2 bytes.
- **Memória com alfabeto minúsculo.** Para `σ ≤ 2` a árvore retém menos que as
  tabelas canônicas (76 B e 223 B contra cerca de 500 B), porque as tabelas pagam
  o custo fixo de dois typed arrays. O ganho de memória só aparece quando `σ`
  cresce.

O canônico nunca aumenta o payload: o número de bits é o mesmo da árvore com os
mesmos comprimentos (verificado em teste para cinco distribuições).

## Limitações

- O canônico **descarta as frequências**. A árvore reconstruída do `HUF` mantém
  pesos e topologia, usados pela visualização do jogo; a tabela `HUC` só permite
  decodificar.
- Os testes comparam sempre com a árvore de Huffman do próprio dado ou com uma
  árvore válida fornecida; não há comparação com implementação externa (por
  exemplo, `zlib`).
- Os corpora são sintéticos (semente fixa), não dados reais de telemetria.
- Os números de tempo valem para a máquina e a versão do Node indicadas acima.
