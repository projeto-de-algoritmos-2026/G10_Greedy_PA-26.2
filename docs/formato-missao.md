# Formato de missão, progressão e editor de cenários

Cada missão é um documento declarativo. As quatro missões oficiais em
`src/data/` e os cenários importados pelo editor passam pela **mesma** validação
(`validateMissionDocument`) antes de chegar ao jogo.

## Schema v1

```json
{
  "schemaVersion": 1,
  "id": "meu-cenario",
  "title": "Título exibido",
  "briefing": "Texto do briefing.",
  "objectives": ["Objetivo 1"],
  "bandwidthBitsPerTimeUnit": 16,
  "telemetry": {
    "alphabet": [
      { "value": 0, "label": "nominal" },
      { "value": 1, "label": "alerta" }
    ],
    "originalFormat": { "encoding": "unsigned-integer", "bitsPerSymbol": 8, "sizeUnit": "bit" }
  },
  "packets": [
    { "id": "pacote-a", "deadline": 10, "payload": [0, 0, 0, 1] },
    { "id": "pacote-b", "deadline": 4, "payload": [1, 0] }
  ]
}
```

`schemaVersion` é verificado primeiro: um documento sem versão ou com versão
desconhecida é recusado sem que os demais campos sejam interpretados. Mudanças
incompatíveis no formato exigem um novo número de versão.

## Regras de consistência

| Campo | Regra |
|---|---|
| qualquer objeto | campos desconhecidos são rejeitados |
| `id`, `packets[].id` | minúsculas, números e hífens; até 48 caracteres; pacotes sem repetição |
| `title`, `briefing`, `objectives` | textos não vazios; 80 / 600 / 200 caracteres; 1 a 6 objetivos distintos |
| `bandwidthBitsPerTimeUnit` | número finito, maior que 0 e até 1 000 000 |
| `originalFormat` | `unsigned-integer`, `bit`, de 1 a 32 bits por símbolo |
| `alphabet` | 2 a 16 símbolos; valores de 0 a 255 e rótulos sem repetição |
| `alphabet[].value` | precisa caber em `bitsPerSymbol` |
| `alphabet[]` | todo símbolo declarado aparece em algum payload |
| `packets` | 1 a 12 pacotes |
| `deadline` | número finito entre 0 e 1 000 000 |
| `payload` | 1 a 2048 símbolos do alfabeto; no máximo 8192 na missão |

Duas regras merecem justificativa:

- **Valor × bits por símbolo.** Declarar 2 bits por símbolo com o valor 5 no
  alfabeto subestimaria o tamanho original e distorceria a comparação com o
  cenário comprimido.
- **Símbolo sem ocorrência.** Um símbolo que não aparece não recebe folha nem
  código; mantê-lo no alfabeto prometeria uma decisão de Huffman inexistente.

A validação acumula **todos** os problemas, cada um com o caminho do campo
(`packets[2].deadline`), para que o editor os mostre de uma só vez.

## Modelo de escalonamento

O schema descreve apenas o modelo em que EDD é ótimo para o maior atraso: um
único canal, todos os pacotes disponíveis em `t = 0`, sem preempção. Um pacote
aceita somente `id`, `deadline` e `payload`. Atributos como `releaseTime`,
`priority`, `weight` ou `preemptive` são rejeitados com uma mensagem explícita:
aceitá-los apresentaria outra regra sob o nome de EDD sem a análise de
otimalidade correspondente (ver [escalonamento-edd.md](escalonamento-edd.md)).

Para as missões oficiais, os testes comparam EDD com **todas** as permutações de
pacotes, nos cenários original e comprimido.

## Missões oficiais

| Missão | Banda | Distribuição | O que o cenário demonstra |
|---|---:|---|---|
| DeepSpace: sinal de emergência | 16 | um símbolo dominante | fluxo completo de Huffman e EDD |
| Órbita em equilíbrio | 8 | uniforme, 8 símbolos | empates em toda fusão; atraso inevitável mesmo com EDD |
| Tempestade solar | 64 | muito enviesada, 7 símbolos | só a compressão cumpre os prazos; dois deadlines iguais |
| Sinal fraco | 4 | 5 símbolos, original em 3 bits | cabeçalho maior que a economia: comprimir aumenta o total e atrasa |

Cada afirmação feita nos briefings é verificada em `src/data/missions.test.ts`
a partir do relatório calculado pela simulação.

## Progressão

- A campanha oficial é linear: concluir uma missão libera a seguinte.
- Cenários importados ficam sempre disponíveis e não contam para a campanha.
- Ao concluir uma missão são registradas, a partir do relatório: número de
  conclusões, se a árvore atingiu o custo de Huffman, se a ordem atingiu o
  atraso máximo de EDD e o menor atraso máximo obtido. As marcas são
  cumulativas: uma tentativa pior não as remove.

## Progresso salvo

O progresso é gravado em `localStorage`, na chave
`deepspace-mission-control:progress`, sem conta e sem envio de dados:

```text
{ schemaVersion: 1, results, sessions, customMissions, lastMissionId }
```

`sessions` guarda o estado serializável da tentativa em andamento de cada
missão, o que permite fechar a página e continuar depois. Na leitura, o
conteúdo é tratado como não confiável (`restoreProgress`):

- versão desconhecida ou JSON corrompido: começa do zero;
- cenário importado inválido, repetido ou com ID de missão oficial: descartado;
- resultado com tipos ou valores impossíveis: descartado;
- tentativa que os comandos da missão não poderiam produzir (fusão inexistente,
  ordem com pacote desconhecido, fase posterior à compressão com árvore
  incompleta): descartada, e a missão recomeça do briefing;
- missão atual bloqueada ou inexistente: volta à primeira missão pendente.

Cada parte é validada de forma independente, de modo que um registro corrompido
não apaga o restante. Se o navegador recusar a gravação (cota ou modo privado),
a interface avisa e o jogo continua funcionando na sessão atual.

## Editor de cenários

Na aba **Editor de cenários** é possível:

1. começar a partir de uma missão existente, colar um documento ou importar um
   arquivo `.json`;
2. ver a validação a cada alteração, com a lista de problemas;
3. pré-visualizar métricas calculadas pela simulação (total efetivo, cabeçalho,
   tempo e atraso máximo com EDD, com e sem compressão);
4. adicionar o cenário à coleção local, até 12 cenários, ou atualizar um
   existente;
5. baixar o documento normalizado como JSON.

Um cenário importado não pode usar o ID de uma missão oficial. Atualizar ou
remover um cenário descarta o resultado e a tentativa salvos para ele, pois
foram obtidos com outros dados.
