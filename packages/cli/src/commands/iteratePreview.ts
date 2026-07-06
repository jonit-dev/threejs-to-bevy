import { startWebPreview, type IWebPreviewServer } from "@threenative/runtime-web-three";

export interface IIteratePreview {
  close: () => Promise<void>;
  url: string;
}

export type IteratePreviewStarter = (bundlePath: string) => Promise<IIteratePreview>;

export async function startIteratePreview(bundlePath: string): Promise<IIteratePreview> {
  const server = await startWebPreview({ bundlePath, silent: true });
  return previewFromServer(server);
}

export async function withIteratePreview<T>(
  bundlePath: string,
  run: (preview: IIteratePreview) => Promise<T>,
  startPreview: IteratePreviewStarter = startIteratePreview,
): Promise<T> {
  const preview = await startPreview(bundlePath);
  try {
    return await run(preview);
  } finally {
    await preview.close();
  }
}

function previewFromServer(server: IWebPreviewServer): IIteratePreview {
  return {
    close: () => server.close(),
    url: server.url,
  };
}
