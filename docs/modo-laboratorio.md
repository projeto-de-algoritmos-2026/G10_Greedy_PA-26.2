# Modo laboratório

O laboratório aplica o mesmo codec da missão a conteúdo fornecido pelo usuário,
fora da narrativa. Ele fica na aba **Laboratório** e não altera o progresso das
missões.

## Processamento local

Texto e arquivos são lidos com as APIs do navegador (`TextEncoder`,
`Blob.arrayBuffer`) e processados na própria página. Nenhum byte é enviado a um
servidor: a aplicação é estática e não possui backend. Os downloads são gerados
a partir de um `Blob` local.

## Entradas

| Entrada | Tratamento |
|---|---|
| Texto digitado | convertido para bytes UTF-8 antes da codificação |
| Arquivo qualquer | bytes lidos como estão, sem interpretação |
| Arquivo `.huf` | decodificado e oferecido para download restaurado |

## O que é exibido

- **Frequências:** cada byte presente, sua contagem, proporção e código, do mais
  frequente ao menos frequente.
- **Árvore:** diagrama SVG para até 16 folhas; acima disso, somente a
  alternativa textual, que contém a árvore completa.
- **Cabeçalho:** campos do [formato v1](formato-huffman.md), tamanho da árvore
  serializada e os primeiros bytes em hexadecimal.
- **Padding:** bits de preenchimento do último byte do payload.
- **Taxas:**

```text
taxa efetiva      = (cabeçalho + payload com padding) / original   [em bytes]
taxa teórica      = bits úteis / (8 × bytes originais)
comprimento médio = bits úteis / bytes originais                   [bits por byte]
entropia H        = −Σ p(s) · log2 p(s)
```

Para entradas com mais de um símbolo vale `H ≤ comprimento médio < H + 1`,
propriedade verificada nos testes. Quando o cabeçalho supera a economia do
payload, a interface informa que o arquivo codificado ficou **maior** que o
original, em vez de esconder o resultado.

## Round-trip

`analyzeLabInput` só devolve um resultado depois de empacotar o contêiner,
separá-lo de novo, decodificá-lo e comparar byte a byte com a entrada. O arquivo
“restaurado” oferecido para download é a saída dessa decodificação, não uma
cópia da entrada. Assim, `decode(encode(dados)) === dados` é uma condição para
qualquer download existir.

## Limites e erros

| Situação | Código | Comportamento |
|---|---|---|
| entrada vazia | `EMPTY_INPUT` | recusada: não há símbolos |
| entrada acima de 1 MiB | `INPUT_TOO_LARGE` | recusada antes de ler o arquivo |
| `.huf` acima de 1 MiB + cabeçalho máximo | `CONTAINER_TOO_LARGE` | recusado antes de ler o arquivo |
| cabeçalho declara mais de 1 MiB | `RESTORED_TOO_LARGE` | recusado antes de alocar a saída |
| `.huf` corrompido ou de outro formato | `INVALID_CONTAINER` | mensagem do codec; nenhum dado parcial |
| decodificação diferente da entrada | `ROUND_TRIP_FAILED` | nenhum arquivo é gerado |

O limite de 1 MiB existe porque a análise roda de forma síncrona na thread da
interface. O cabeçalho máximo do formato v1 tem 1804 bytes (13 fixos, 256 folhas
de 6 bytes e 255 ramos de 1 byte), e Huffman nunca usa mais de 8 bits por byte
de entrada; por isso um contêiner gerado pelo laboratório sempre cabe em
`1 MiB + 1804 bytes`.

## Camadas

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| algoritmos | `algorithms/huffman/codec.ts` | `packContainer`, `unpackContainer` |
| domínio | `domain/lab.ts` | análise, limites, erros e round-trip |
| infraestrutura | `infra/download.ts`, `infra/readFile.ts` | arquivos e download |
| interface | `components/LabTerminal.tsx` | entrada, tabelas, árvore e botões |
