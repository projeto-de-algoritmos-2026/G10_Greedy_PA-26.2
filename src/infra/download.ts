/**
 * Entrega bytes gerados no navegador como um arquivo. O conteúdo vira um Blob local e uma URL
 * temporária `blob:`; nada é enviado pela rede.
 */
export function downloadBytes(bytes: Uint8Array, fileName: string, mimeType: string): void {
  // A cópia garante um ArrayBuffer próprio, mesmo que `bytes` seja a visão de um buffer maior.
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(text: string, fileName: string, mimeType: string): void {
  downloadBytes(new TextEncoder().encode(text), fileName, mimeType);
}
