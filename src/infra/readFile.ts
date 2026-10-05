/** Lê um arquivo escolhido pelo usuário inteiramente na memória da página. */
export async function readFileBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export async function readFileText(file: Blob): Promise<string> {
  return new TextDecoder().decode(await readFileBytes(file));
}
