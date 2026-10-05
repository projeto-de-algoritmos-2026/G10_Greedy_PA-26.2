# Roteiro do vídeo de apresentação

## Objetivo

Apresentar em aproximadamente **9min40s** uma missão completa e relacionar o
que aparece na interface com as implementações de Huffman e EDD.

- **Gustavo:** explica o código, a arquitetura, os algoritmos, as complexidades
  e os testes.
- **Lucas:** apresenta o site, conduz a missão e mostra os resultados.

> A duração-alvo de 9 a 10 minutos segue a orientação mais recente da dupla e
> substitui o limite inicial de cinco minutos registrado na issue 18.

O vídeo deve ser gravado com a aplicação publicada no
[GitHub Pages](https://projeto-de-algoritmos-2026.github.io/G10_Greedy_PA-26.2/).
O fluxo precisa chegar ao relatório final. As fusões repetitivas podem ser
aceleradas, mas agora há tempo para mostrar mais de uma decisão de Huffman, o
gráfico de Gantt e as funcionalidades complementares.

## Preparação antes de gravar

1. Abrir o Pages em uma janela sem dados antigos ou reiniciar a campanha.
2. Deixar o repositório aberto nestes arquivos, exatamente nesta ordem:
   - `src/App.tsx`;
   - `src/algorithms/heap/MinHeap.ts`;
   - `src/algorithms/huffman/buildTree.ts`;
   - `src/algorithms/huffman/codec.ts`;
   - `src/domain/transmission.ts`;
   - `src/algorithms/scheduling/earliestDueDate.ts`;
   - `src/domain/report.ts`;
   - `src/domain/mvpValidation.test.ts`.
3. Configurar a captura em 1080p e conferir o volume dos dois microfones.
4. Fazer um ensaio com duração-alvo de **9min20s a 9min50s**.
5. Preparar os atalhos para alternar rapidamente entre navegador e editor.
6. Não mostrar notificações, credenciais, abas pessoais ou dados sensíveis.

## Roteiro cronometrado

### 0:00–0:40 — Lucas — contexto e objetivo

**Tela:** página inicial e navegação superior.

> Este é o DeepSpace: Mission Control, nosso projeto do módulo de Algoritmos
> Ambiciosos. A aplicação transforma dois algoritmos em etapas de uma missão
> espacial. Primeiro precisamos comprimir a telemetria da sonda com Codificação
> de Huffman. Depois usamos Earliest Due Date, ou EDD, para definir a ordem de
> transmissão dos pacotes e reduzir o maior atraso. Todo o projeto está
> publicado no GitHub Pages e funciona diretamente no navegador, sem backend.

**Ações:** mostrar o título, a URL publicada e as quatro opções da navegação.

### 0:40–1:35 — Lucas — campanha e início da missão

**Tela:** aba **Missões**, briefing e terminal de telemetria.

> A campanha possui quatro missões oficiais. Elas apresentam distribuições de
> símbolos, larguras de banda e prazos diferentes, e são liberadas em sequência.
> O progresso fica salvo apenas neste navegador. Também existem um laboratório
> para dados livres e um editor de cenários em JSON. Para a demonstração vamos
> usar a primeira missão, DeepSpace: sinal de emergência. Ela contém seis
> pacotes e seis símbolos de telemetria. O objetivo é construir uma árvore
> compartilhada, transmitir os dados sem perda e organizar os pacotes para
> minimizar o atraso máximo.

**Ações:** abrir a primeira missão, ler rapidamente os objetivos, clicar em
**Iniciar missão**, abrir **Telemetria**, concluir a investigação, voltar à sala
e abrir **Huffman**.

### 1:35–2:20 — Gustavo — arquitetura e fluxo dos dados

**Tela:** `src/App.tsx` e a árvore de diretórios do projeto.

> O código separa apresentação, estado e algoritmos. Os componentes React apenas
> exibem dados e enviam comandos. A pasta game controla as fases, as escolhas do
> jogador e a progressão. O domínio valida a missão e conecta compressão,
> transmissão e relatório. Já as implementações estudadas ficam em algorithms e
> não dependem do React nem de APIs do navegador. As missões são documentos
> declarativos: depois da validação, frequências, árvore de referência, tempos e
> métricas são derivados. Isso evita colocar resultados prontos na interface e
> também permite testar a lógica separadamente.

**Destacar:** imports principais de `App.tsx` e as pastas `algorithms`, `domain`,
`game`, `components`, `data` e `infra`.

### 2:20–3:35 — Gustavo — min-heap e construção de Huffman

**Tela:** `MinHeap.ts` e `buildTree.ts`.

> Huffman começa contando quantas vezes cada símbolo aparece no corpus completo
> da missão. Essa etapa é linear no tamanho da entrada. Cada símbolo vira uma
> folha e entra em uma min-heap ordenada pelo peso. A heap foi implementada no
> projeto: a inserção sobe o elemento enquanto necessário, e a extração troca a
> raiz pelo último item e restaura a propriedade descendo pela estrutura.
>
> Na construção da árvore extraímos os dois menores pesos, criamos um nó pai com
> a soma e colocamos esse nó novamente na heap. Repetimos até sobrar somente a
> raiz. Com sigma símbolos distintos, são feitas sigma menos uma fusões e o
> custo é O de sigma log sigma. Um percurso posterior associa zero às arestas da
> esquerda e um às da direita, produzindo um código de prefixo. Os desempates
> são determinísticos para que testes e replays gerem o mesmo resultado, mas
> árvores alternativas de mesmo custo continuam válidas.

**Destacar:** comparador, `insert`, `extractMin`, laço de fusões e criação do nó
pai.

### 3:35–4:40 — Lucas — construção no terminal Huffman

**Tela:** terminal Huffman da aplicação.

> Aqui aparecem as frequências calculadas para os seis símbolos e os nós ativos
> da min-heap. O usuário seleciona dois candidatos por vez. Nesta primeira
> escolha, os menores pesos são 26 e 28. A interface identifica que o par segue
> a regra gulosa e registra a fusão no histórico. Se escolhêssemos outro par, o
> jogo permitiria continuar, mas avisaria que a escolha saiu da regra de
> Huffman. A avaliação definitiva acontece somente quando a árvore está
> completa, porque empates e árvores diferentes ainda podem produzir o mesmo
> custo.
>
> A cada fusão podemos revisar a subárvore formada ou desfazer a última decisão.
> No final, a aplicação mostra os códigos, o comprimento médio e a comparação
> com a árvore de referência.

**Ações:** realizar pelo menos duas fusões completas, mostrar o histórico e a
subárvore; acelerar somente as fusões restantes; exibir a tabela final e clicar
em **Confirmar árvore e continuar**.

### 4:40–5:35 — Gustavo — codec e custo efetivo

**Tela:** `codec.ts` e `transmission.ts`.

> A árvore não serve apenas para uma animação. O codec recebe bytes reais,
> percorre a tabela e empacota os códigos em bits. O cabeçalho registra a versão,
> o tamanho original, os bits úteis, o padding e a árvore em pré-ordem, então a
> decodificação não depende do estado da tela. O projeto sempre testa se
> decode de encode reproduz exatamente a entrada.
>
> Para a missão, uma única árvore é compartilhada por todos os pacotes. O
> cabeçalho é pago uma vez, enquanto payload e padding são calculados para cada
> pacote. Por isso mostramos duas taxas. A teórica considera apenas os 752 bits
> do payload contra 2896 bits originais. A efetiva também inclui 432 bits de
> cabeçalho e 16 de padding, chegando a 1200 bits. Isso reduz a economia de
> aproximadamente 74,03% para 58,56%. Também implementamos Huffman canônico como
> representação alternativa para comparar cabeçalho, memória e desempenho.

**Destacar:** empacotamento, round-trip, `sharedHeaderBitLength` e cálculo do
tempo pela largura de banda.

### 5:35–6:35 — Gustavo — EDD e limites do modelo

**Tela:** `earliestDueDate.ts` e `report.ts`.

> Depois da compressão, cada pacote recebe uma duração calculada com seus bits e
> a largura de banda. EDD ordena os pacotes por prazo não decrescente. A
> ordenação custa O de m log m e um percurso linear acumula início, conclusão e
> atraso. A ideia da prova é uma troca: se dois pacotes adjacentes estão fora da
> ordem de prazo, colocar primeiro o de menor prazo não piora o maior atraso.
> Repetindo as trocas, chegamos a uma ordem EDD ótima.
>
> Essa garantia depende do modelo: há um único canal, todos os pacotes estão
> disponíveis no instante zero e não existe preempção. EDD não é apresentado
> como solução geral para múltiplos canais, datas de liberação, precedências,
> prioridades ou objetivos como soma dos atrasos. O cabeçalho Huffman aparece
> como um custo inicial comum; ele desloca as conclusões, mas não muda a ordem
> por prazo. O relatório compara a escolha manual com essa referência.

**Destacar:** `earliestDueDateOrder`, `scheduleInGivenOrder` e construção das
comparações no relatório.

### 6:35–7:45 — Lucas — scheduler, transmissão e relatório

**Tela:** scheduler, gráficos de Gantt e relatório final.

> O scheduler começa com a ordem original da missão. Podemos reorganizar os
> pacotes por arrastar e soltar ou pelos botões, que também funcionam por
> teclado. A tabela recalcula imediatamente o atraso máximo e compara a escolha
> com EDD. Os gráficos de Gantt mostram a duração de cada pacote e a posição dos
> prazos.
>
> Vou aplicar a referência EDD: sync, radiation, power, thermal, pressure e
> navigation. Agora a ordem manual atinge o mesmo atraso máximo da referência,
> que é 35. Depois de confirmar e concluir a transmissão, o relatório reúne o
> que realmente aconteceu. O payload caiu de 2896 para 752 bits; com cabeçalho
> e padding, o total ficou em 1200 bits e o tempo caiu de 181 para 75 unidades.
> O relatório também confirma que nossa árvore teve o mesmo custo de Huffman e
> que nossa ordem coincidiu com EDD.

**Ações:** mostrar a ordem inicial, mover um pacote, aplicar EDD, percorrer os
dois gráficos, confirmar a ordem, concluir a transmissão e abrir **Relatório**.

### 7:45–8:35 — Gustavo — testes, CI e confiabilidade

**Tela:** `mvpValidation.test.ts` e página de Actions com execução aprovada.

> Além dos testes unitários da heap, da árvore e do scheduler, há uma validação
> integrada. Ela faz o round-trip do corpus e de cada pacote das quatro missões,
> confere os números da primeira missão com um oráculo independente e enumera as
> seis fatorial, ou 720, ordens possíveis. Nenhuma produz atraso máximo menor
> que 35. A suíte atual possui 322 testes. Em cada pull request, o GitHub Actions
> instala as dependências, executa lint, testes e build. O deploy do Pages só é
> iniciado quando a validação da branch principal termina com sucesso.

**Destacar:** valores independentes, laço das permutações, resultado da suíte e
dependência entre os workflows.

### 8:35–9:20 — Lucas — laboratório, editor e publicação

**Tela:** abas **Laboratório** e **Editor de cenários**, terminando no Pages.

> Fora da campanha, o laboratório aplica o mesmo codec a um texto ou arquivo do
> usuário. Ele mostra frequências, códigos, árvore, cabeçalho, padding, entropia
> e as taxas teórica e efetiva. Também permite baixar o contêiner codificado e o
> arquivo restaurado. Tudo é processado localmente e nenhum byte é enviado a um
> servidor. No editor podemos importar ou criar uma missão em JSON. O schema
> rejeita dados inconsistentes e propriedades que sairiam do modelo em que EDD
> é ótimo. A aplicação final é estática e está disponível nesta URL do GitHub
> Pages.

**Ações:** analisar um texto curto no laboratório, mostrar o aviso ou o
round-trip, abrir rapidamente o editor e voltar à URL publicada.

### 9:20–9:40 — Lucas — encerramento

**Tela:** aplicação e repositório lado a lado.

> Na aplicação, as duas estratégias gulosas podem ser executadas, comparadas e
> visualizadas em uma missão completa, usando tamanhos e tempos calculados de
> verdade. O projeto também deixa explícitas as hipóteses e limitações de cada
> algoritmo. O código, o relatório e o site estão disponíveis no repositório.
> Obrigado.

## Divisão total de tempo

| Integrante | Responsabilidade | Tempo de fala |
| --- | --- | ---: |
| Gustavo | Código, arquitetura, algoritmos e testes | 4min45s |
| Lucas | Site, missão, resultados e encerramento | 4min55s |
| **Total** |  | **9min40s** |

## Controle de tempo

Para manter o vídeo entre 9 e 10 minutos:

- fazer a abertura em no máximo 40 segundos;
- mostrar duas fusões completas e acelerar apenas as restantes;
- limitar a explicação de cada arquivo aos trechos indicados;
- não ler todas as linhas das tabelas nem todos os campos do editor;
- deixar navegador, editor e Actions abertos antes de iniciar;
- usar o relatório final para concentrar a recapitulação numérica;
- cortar pausas de navegação, carregamento e troca de janelas.

## Checklist de aceite do vídeo

- [ ] Duração total entre 9 e 10 minutos.
- [ ] Gustavo explica o código e Lucas apresenta o site.
- [ ] As vozes dos dois integrantes estão audíveis.
- [ ] O vídeo mostra uma missão do briefing ao relatório final.
- [ ] Huffman, EDD, complexidades e hipóteses são explicados.
- [ ] Compressão teórica e efetiva são diferenciadas.
- [ ] Testes, CI e ausência de backend são mencionados.
- [ ] Laboratório ou editor de cenários aparece na demonstração.
- [ ] A URL do GitHub Pages aparece na gravação.
- [ ] O vídeo está público ou não listado e abre sem autenticação.
- [ ] O link definitivo substituiu a pendência no README.
