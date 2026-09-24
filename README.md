# DeepSpace: Mission Control

> Jogo educacional point & click sobre Codificação de Huffman e escalonamento
> ambicioso de transmissões espaciais.

O **DeepSpace: Mission Control** coloca o jogador no controle da comunicação com
uma sonda espacial. Durante uma janela limitada de contato, o operador precisa
comprimir pacotes de telemetria com Huffman e ordená-los por prazo para reduzir o
maior atraso da transmissão.

O projeto é desenvolvido para a disciplina **Projeto de Algoritmos**, da
Universidade de Brasília — FGA, no módulo de **Algoritmos Ambiciosos**.

## Estado do projeto

O projeto está na fase de planejamento e preparação do MVP. A entrega acadêmica
está prevista para **5 de outubro de 2026**.

- [Issues do projeto](https://github.com/projeto-de-algoritmos-2026/G10_Greedy_PA-26.2/issues)
- [Épico do MVP](https://github.com/projeto-de-algoritmos-2026/G10_Greedy_PA-26.2/issues/1)
- [Milestones](https://github.com/projeto-de-algoritmos-2026/G10_Greedy_PA-26.2/milestones)
- [Estrutura e arquitetura do projeto](docs/estrutura-do-projeto.md)
- [Formato binário Huffman](docs/formato-huffman.md)

## Problema

A sonda produz pacotes de telemetria com conteúdos, tamanhos e deadlines
diferentes. O canal até a Terra possui largura de banda limitada. Para completar
a missão, o jogador deverá:

1. construir uma árvore de Huffman a partir das frequências da telemetria;
2. gerar códigos de prefixo e comprimir os pacotes;
3. observar como a compressão altera suas durações de transmissão;
4. ordenar os pacotes pelo menor deadline, aplicando Earliest Due Date (EDD);
5. comparar suas decisões com as soluções produzidas pelos algoritmos.

## MVP

O primeiro lançamento terá uma missão completa e reproduzível com:

- sala de controle point & click;
- pacote de dados e briefing da missão;
- min-heap implementada no projeto;
- construção manual e automática da árvore de Huffman;
- possibilidade de manter escolhas diferentes das prescritas por Huffman;
- codificação e decodificação reais da telemetria;
- escalonador interativo com estratégia EDD;
- linha do tempo em formato de gráfico de Gantt;
- relatório final com compressão, tempos, atrasos e comparação de soluções;
- execução inteiramente local no navegador;
- publicação no GitHub Pages.

Recursos como múltiplas missões, upload de arquivos e Huffman canônico fazem
parte do roadmap pós-MVP.

## Algoritmos estudados

### Codificação de Huffman

Uma min-heap mantém os nós ativos. A cada iteração, os dois nós de menor peso são
removidos e combinados até restar uma única árvore. Para um alfabeto com `σ`
símbolos, a construção custa `O(σ log σ)`; contar frequências e processar a
entrada custa `O(n)`.

O jogador poderá sair da escolha prescrita pelo algoritmo e comparar o
comprimento médio da árvore resultante com o código ótimo.

### Earliest Due Date

Os pacotes são ordenados por deadlines não decrescentes. Para o modelo da missão
— um único canal, todos os pacotes disponíveis no instante inicial e transmissão
sem preempção — essa ordem minimiza o maior atraso.

A compressão modifica as durações e o atraso obtido, mas não modifica a regra de
ordenação ótima por deadline.

## Fluxo da missão

```mermaid
flowchart LR
    A[Briefing] --> B[Sala de controle]
    B --> C[Telemetria]
    C --> D[Terminal Huffman]
    D --> E[Compressão]
    E --> F[Escalonador EDD]
    F --> G[Transmissão]
    G --> H[Relatório da missão]
```

## Tecnologias

- **React** — interface e composição das telas;
- **TypeScript** — algoritmos, domínio e mecânicas;
- **Vite** — desenvolvimento e geração dos arquivos estáticos;
- **HTML, CSS e SVG** — cenário, terminais e visualizações;
- **Vitest e Testing Library** — testes unitários e de interface;
- **GitHub Actions e GitHub Pages** — integração, verificação e publicação.

Min-heap, Huffman, codec binário e escalonamento serão implementados pela dupla,
sem bibliotecas que resolvam esses algoritmos.

## Arquitetura

A aplicação não possui servidor. Todas as operações são executadas no navegador,
e nenhum arquivo do usuário precisa ser enviado para serviços externos.

```text
src/
├── algorithms/     # heap, Huffman, codec e EDD
├── domain/         # entidades e regras da missão
├── game/           # estado, fluxo e simulação
├── components/     # sala e terminais React
├── data/           # definição das missões
├── assets/         # imagens, ícones e sons
└── styles/         # identidade visual e acessibilidade
```

As regras completas de arquitetura, fórmulas, decisões técnicas, testes e roadmap
estão em [docs/estrutura-do-projeto.md](docs/estrutura-do-projeto.md).

## Execução local

Requer Node 22 (`.nvmrc`):

```bash
npm install
npm run dev
```

Verificações:

```bash
npm run test
npm run lint
npm run typecheck
npm run format:check
npm run build
```

## Princípios de qualidade

- lógica algorítmica independente do React;
- métricas calculadas a partir dos dados efetivamente codificados;
- round-trip obrigatório: `decode(encode(dados)) === dados`;
- cabeçalho e padding visíveis nas métricas de compressão;
- suporte a teclado e preferência por movimento reduzido;
- commits graduais e participação dos dois integrantes.

## Autoria

- Gustavo Xavier Evangelista
- Lucas A. Zanetti

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).
