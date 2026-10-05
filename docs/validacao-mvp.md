# Validação integrada do MVP

Este documento reúne o protocolo e as evidências da validação integrada do
MVP. Um critério só deve ser marcado como aprovado depois que a evidência
correspondente tiver sido registrada.

## Identificação da rodada

| Campo | Valor |
|---|---|
| Commit validado | Pendente; alterações ainda não commitadas na `issue-17` |
| Data | 5 de outubro de 2026 |
| URL | <https://projeto-de-algoritmos-2026.github.io/G10_Greedy_PA-26.2/> (HTTP 200 em 05/10/2026) |
| Node.js | Alvo: 22.x; execução local: 24.14.1 |
| Responsáveis | Automação executada; validação humana pendente |

O catálogo atual possui quatro missões oficiais. O round-trip automatizado cobre
todas elas. O oráculo numérico e a enumeração explícita de 720 ordens usam
`deep-space-alpha`, primeira missão da campanha e cenário-base do MVP.

## Oráculo independente de `deep-space-alpha`

Os valores abaixo foram derivados diretamente da definição declarativa da
missão. Eles não usam as saídas de `buildMissionReport` como fonte.

### Frequências

| Símbolo | Frequência |
|---:|---:|
| 0 | 194 |
| 1 | 26 |
| 2 | 38 |
| 3 | 46 |
| 4 | 28 |
| 5 | 30 |
| **Total** | **362** |

As combinações de Huffman resultam em comprimentos de código `1, 4, 3, 3,
4, 3` para os símbolos `0..5`, respectivamente. Assim, o payload codificado
possui `752` bits.

### Transmissão

| Métrica | Original | Comprimido |
|---|---:|---:|
| Payload | 2896 bits | 752 bits |
| Cabeçalho | 0 bits | 432 bits |
| Padding | 0 bits | 16 bits |
| Total efetivo | 2896 bits | 1200 bits |
| Tempo de transmissão | 181 | 75 |

Com largura de banda de `16 bits/unidade`, o cabeçalho comprimido custa `27`
unidades. A razão efetiva é `1200 / 2896`, com economia de `1696 / 2896`.

### Escalonamento comprimido

A ordem EDD esperada é:

```text
sync → radiation → power → thermal → pressure → navigation
```

Ela produz `T_max = 35`. A ordem inicial da missão produz `T_max = 67`.
O teste automatizado enumera as `6! = 720` ordens e confirma que nenhuma delas
possui atraso máximo menor que `35`.

## Evidências automatizadas

| Verificação | Comando/evidência | Resultado |
|---|---|---|
| Round-trip das quatro missões oficiais | `npm run test` | Aprovado em 05/10/2026 |
| 720 ordens de `deep-space-alpha` | `npm run test` | Aprovado em 05/10/2026 |
| Oráculo do relatório | `npm run test` | Aprovado em 05/10/2026 |
| Suíte completa | `npm run test` | 20 arquivos e 261 testes aprovados |
| Lint | `npm run lint` | Aprovado em 05/10/2026 |
| Build estático | `npm run build` | Aprovado em 05/10/2026 |
| Reinstalação das dependências | `npm ci` | Aprovada; 0 vulnerabilidades |
| CI da `main` rebased | [execução 37333876694](https://github.com/projeto-de-algoritmos-2026/G10_Greedy_PA-26.2/actions/runs/37333876694) | Aprovada no commit `1d30498` |
| GitHub Pages | Documento, JavaScript e CSS publicados | HTTP 200 em 05/10/2026 |

O `npm ci` local emitiu avisos de engine porque a máquina de validação usa
Node `24.14.1`, enquanto `jsdom` e duas dependências pedem `24.15.0+` nessa
linha. Lint, testes e build passaram depois da reinstalação. O CI da branch
`issue-17`, configurado com Node 22, deve substituir esta ressalva depois do push.

## Matriz de navegadores

Executar a aplicação publicada com o console aberto desde o início. Registrar
a versão exata do navegador e concluir seleção da primeira missão, briefing,
investigação, Huffman, escalonamento, transmissão, relatório e reinício.

| Navegador | Versão | Fluxo completo | Erros no console | Warnings inesperados | Responsável/data |
|---|---|---|---|---|---|
| Google Chrome | 154.0.8037.95 | Pendente | Pendente | Pendente | Pendente |
| Mozilla Firefox | Ausente no ambiente de automação | Pendente | Pendente | Pendente | Pendente |

## Teste com pessoa externa

Entregar somente a URL e a instrução: **"Conclua a missão."** O observador não
deve explicar controles, algoritmos ou ordem das telas durante a sessão.

| Campo | Registro |
|---|---|
| Participante | Pendente; registrar apenas identificação anonimizada |
| Data e navegador | Pendente |
| Missão concluída | Pendente |
| Intervenções orais | Pendente; para aprovação deve ser `0` |
| Tempo total | Pendente |
| Pontos de hesitação | Pendente |
| Defeitos encontrados | Pendente |

## Checklist de aceite

- [ ] Uma pessoa externa concluiu a missão sem orientação oral.
- [x] O round-trip preservou todos os dados das missões oficiais.
- [x] As 720 ordens confirmaram EDD no cenário final.
- [x] As métricas foram conferidas por um oráculo independente do relatório.
- [ ] O fluxo completo funcionou no Chrome atual.
- [ ] O fluxo completo funcionou no Firefox atual.
- [ ] `npm ci`, testes, lint e build passaram em ambiente limpo.
- [ ] Não houve erros ou warnings inesperados no console.

## Registro de defeitos

| ID | Descrição | Severidade | Correção | Reteste |
|---|---|---|---|---|
| — | Nenhum resultado registrado ainda | — | — | — |
