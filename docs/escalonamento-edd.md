# Escalonamento EDD e métricas de atraso

Modela um único canal de transmissão, não preemptivo, com todos os pacotes
disponíveis em `t=0`. A sigla usada no projeto é EDD (Earliest Due Date); os
slides da disciplina apresentam a mesma estratégia como Earliest Deadline
First (EDF).

## Nomenclatura

Para cada pacote `j`:

| Símbolo | Campo             | Significado                        |
| ------- | ----------------- | ----------------------------------- |
| `p_j`   | `processingTime`  | duração de transmissão              |
| `d_j`   | `dueDate`         | prazo de entrega                    |
| `C_j`   | `completionTime`  | instante de conclusão               |
| `T_j`   | `lateness`        | `max(0, C_j - d_j)`, nunca negativo |
| `T_max` | `maxLateness`     | `max(T_j)` do cronograma            |

## Algoritmo

`scheduleEarliestDueDate` (`src/algorithms/scheduling/earliestDueDate.ts`):

1. ordena os pacotes por `d_j` não decrescente (`earliestDueDateOrder`);
2. agenda na ordem resultante, acumulando `C_j` a partir do pacote anterior
   (`scheduleInGivenOrder`);
3. deriva `T_j` e `T_max` do cronograma calculado — nunca são valores
   informados à parte.

`scheduleInGivenOrder` também é usada isoladamente para agendar uma ordem
manual escolhida pelo jogador, permitindo comparar com a referência EDD via
`compareToEarliestDueDate` (`src/algorithms/scheduling/metrics.ts`).

## Hipótese de otimalidade

Para uma única máquina, sem datas de liberação e sem preempção, ordenar por
prazo não decrescente minimiza `T_max`.

**Prova por troca (exchange argument).** Seja um cronograma ótimo com dois
pacotes adjacentes `i` e `j`, `i` transmitido antes de `j`, mas `d_i > d_j`
(fora de ordem EDD). Trocar as posições de `i` e `j`:

- não altera o instante de conclusão de nenhum outro pacote;
- não aumenta a conclusão do par trocado, já que a soma `p_i + p_j` continua
  ocupando o mesmo intervalo de tempo;
- o atraso do pacote que passa a ser transmitido depois (agora `i`, com o
  maior prazo) só pode diminuir ou manter-se, pois `d_i > d_j`.

Repetindo a troca para toda inversão, chega-se a um cronograma em ordem EDD
sem piorar `T_max`. Logo existe um ótimo em ordem EDD — e `T_max` desse
cronograma é o mínimo possível.

A compressão de Huffman altera `p_j` e, portanto, `C_j` e `T_max`, mas não
altera essa regra de ordenação.

## Desempate determinístico

`Array.prototype.sort` é estável desde o ES2019: pacotes com o mesmo `d_j`
preservam a ordem de entrada. O desempate não precisa de uma chave extra e o
resultado é reproduzível entre execuções.

## Casos extremos e validação

- nenhum pacote produz um cronograma vazio (`maxLateness = 0`,
  `totalCompletionTime = 0`);
- duração de transmissão deve ser finita e positiva;
- prazo deve ser finito (pode ser negativo, representando um pacote já
  atrasado no instante de disponibilidade);
- identificador de pacote não pode ser vazio nem duplicado;
- violações lançam `InvalidPacketError`.

## Testes

`src/algorithms/scheduling/scheduling.test.ts` cobre a ordenação EDD, o
cálculo cumulativo do cronograma, a comparação manual × EDD e, para seis
pacotes, testa as 720 permutações possíveis para confirmar que EDD minimiza
`T_max`.
