import { vi } from 'vitest';

export interface CapturedDownload {
  readonly fileName: string;
  readonly mimeType: string;
  /** Lista simples: `Uint8Array` de realms diferentes (jsdom × Node) nunca são `toEqual`. */
  readonly bytes: readonly number[];
}

/**
 * Substitui as APIs de download do navegador, ausentes no jsdom, e registra cada arquivo
 * entregue. Deve ser chamada dentro do teste; `vi.restoreAllMocks()` desfaz os espiões.
 */
export function captureDownloads(): { readonly read: () => Promise<readonly CapturedDownload[]> } {
  const blobs = new Map<string, Blob>();
  const clicks: { readonly fileName: string; readonly url: string }[] = [];

  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:test-${blobs.size}`;
    blobs.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn();
  // O clique real em um link faria o jsdom tentar navegar para a URL `blob:`.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ fileName: this.download, url: this.getAttribute('href') ?? '' });
  });

  return {
    read: () =>
      Promise.all(
        clicks.map(async ({ fileName, url }) => {
          const blob = blobs.get(url);
          if (blob === undefined) throw new Error(`Download sem conteúdo: ${fileName}.`);
          return {
            fileName,
            mimeType: blob.type,
            bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
          };
        }),
      ),
  };
}
