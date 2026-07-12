import { startWebPreview, type IWebPreviewServer } from "@threenative/runtime-web-three";

export interface IIteratePreview {
  close: () => Promise<void>;
  url: string;
}

export type IteratePreviewStarter = (bundlePath: string) => Promise<IIteratePreview>;

export async function startIteratePreview(bundlePath: string): Promise<IIteratePreview> {
  let server;
  try {
    server = await startWebPreview({ bundlePath, silent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/EADDRINUSE|address already in use|port/iu.test(message)) {
      throw new Error(`TN_PREVIEW_PORT_IN_USE: Preview port is unavailable. Stop the process holding it or rerun iterate so the preview can select a free port. ${message}`);
    }
    throw error;
  }
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
