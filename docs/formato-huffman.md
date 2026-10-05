# Formato binário Huffman

O codec trabalha com `Uint8Array`: cada símbolo está no intervalo `0..255`. Isso
permite comprimir telemetria binária diretamente. Texto deve ser convertido para
bytes com `TextEncoder` antes da codificação e reconstruído com `TextDecoder`
depois da decodificação.

## Resultado da codificação

`encode(dados)` devolve duas sequências de bytes:

- `header`: informações necessárias para reconstruir a árvore;
- `payload`: códigos de Huffman empacotados do bit mais significativo para o
  menos significativo.

O último byte do payload é completado com zeros quando necessário. A quantidade
de padding é registrada no cabeçalho e exposta nas métricas. A representação
comprimida final nunca é uma string de `0` e `1`.

Uma árvore pode ser fornecida a `encode` para reutilizar o código criado para o
buffer completo da missão. A árvore é serializada no cabeçalho, portanto árvores
alternativas válidas também podem ser decodificadas sem estado externo.

## Cabeçalho v1

Todos os inteiros de 32 bits usam ordem de bytes big-endian.

| Campo | Tamanho | Descrição |
|---|---:|---|
| assinatura | 3 bytes | ASCII `HUF` |
| versão | 1 byte | atualmente `1` |
| tamanho original | 4 bytes | quantidade de bytes antes da compressão |
| bits úteis | 4 bytes | quantidade de bits do payload sem padding |
| padding | 1 byte | zeros não utilizados no último byte, de `0` a `7` |
| árvore | variável | árvore em pré-ordem |

Tags usadas na serialização da árvore:

| Tag | Conteúdo seguinte |
|---:|---|
| `0` | árvore vazia |
| `1` | símbolo de 1 byte e frequência de 4 bytes |
| `2` | subárvore esquerda seguida da subárvore direita |

As frequências das folhas permitem reconstruir os pesos dos nós internos. A
topologia serializada preserva as escolhas feitas quando existem empates.

## Arquivo contêiner `.huf`

`packContainer(codificado)` concatena `cabeçalho ‖ payload` em um único arquivo,
usado pelo [modo laboratório](modo-laboratorio.md) para download. Nenhum
separador ou campo de tamanho adicional é necessário: a árvore em pré-ordem
delimita o próprio fim, portanto o payload começa no byte seguinte ao último nó.

`unpackContainer(bytes)` percorre o cabeçalho, devolve as duas partes e expõe os
campos declarados (versão, tamanho original, bits úteis, padding, bytes do
cabeçalho e da árvore) antes de qualquer decodificação. Isso permite recusar um
arquivo pelo tamanho declarado sem alocar a saída. A consistência do payload —
comprimento, padding e códigos completos — continua sendo verificada por
`decode`.

## Alternativa canônica

Uma representação que grava só os comprimentos de código (formato `HUC`) e a
comparação de custo com a árvore explícita estão em
[Huffman canônico e benchmarks](huffman-canonico.md).

## Casos extremos e validação

- entrada vazia usa árvore vazia e payload vazio;
- um único símbolo recebe o código `0`, usando um bit por ocorrência;
- a decodificação rejeita assinatura, versão, árvore, tamanhos ou padding
  inconsistentes por meio de `HuffmanCodecError`;
- `decode(encode(dados))` devolve exatamente os bytes de entrada.

As métricas separam tamanho original, cabeçalho, bits úteis, bytes do payload,
padding e total armazenado. O total efetivo inclui cabeçalho e o byte completo
que contém o padding.

## Uso compartilhado na missão

A missão constrói uma única árvore com a concatenação dos payloads. O custo do
cabeçalho dessa árvore é pago uma vez no início da transmissão. Depois, cada
pacote é empacotado com a mesma tabela e contabiliza separadamente seus bits
úteis e o padding do último byte:

```text
total comprimido = cabeçalho compartilhado
                  + soma dos payloads codificados
                  + soma dos paddings dos pacotes
```

O scheduler recebe como custo inicial `bits do cabeçalho / largura de banda`.
As durações dos pacotes usam `(payload + padding) / largura de banda`.
