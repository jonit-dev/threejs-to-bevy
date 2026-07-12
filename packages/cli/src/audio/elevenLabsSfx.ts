export const ELEVENLABS_SFX_MODEL = "eleven_text_to_sound_v2";
export const ELEVENLABS_SFX_OUTPUT_FORMAT = "mp3_44100_128";

export interface IElevenLabsSfxRequest {
  apiKey: string;
  durationSeconds?: number;
  fetch?: typeof fetch;
  loop?: boolean;
  modelId?: string;
  maximumResponseBytes?: number;
  outputFormat?: string;
  prompt: string;
  promptInfluence?: number;
  timeoutMs?: number;
}

export interface IElevenLabsSfxResponse {
  bytes: Uint8Array;
  characterCost?: string;
  contentType: string;
  requestId?: string;
}

export class ElevenLabsSfxError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly billingMayBeUnknown = false,
  ) {
    super(message);
  }
}

const maximumErrorBodyBytes = 4_096;

export async function requestElevenLabsSfx(request: IElevenLabsSfxRequest): Promise<IElevenLabsSfxResponse> {
  const fetchImplementation = request.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 60_000);
  let response: Response;
  try {
    response = await fetchImplementation(
      `https://api.elevenlabs.io/v1/sound-generation?output_format=${encodeURIComponent(request.outputFormat ?? ELEVENLABS_SFX_OUTPUT_FORMAT)}`,
      {
        body: JSON.stringify({
          duration_seconds: request.durationSeconds,
          loop: request.loop ?? false,
          model_id: request.modelId ?? ELEVENLABS_SFX_MODEL,
          prompt_influence: request.promptInfluence,
          text: request.prompt,
        }),
        headers: { "content-type": "application/json", "xi-api-key": request.apiKey },
        method: "POST",
        signal: controller.signal,
      },
    );
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new ElevenLabsSfxError(
      timedOut ? "TN_AUDIO_SFX_PROVIDER_TIMEOUT" : "TN_AUDIO_SFX_PROVIDER_NETWORK",
      `${timedOut ? "ElevenLabs request timed out" : "ElevenLabs request failed"}; the request is not retried and billing status may be unknown.`,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const code = response.status === 401 || response.status === 403
      ? "TN_AUDIO_SFX_PROVIDER_AUTH"
      : response.status === 429
        ? "TN_AUDIO_SFX_PROVIDER_RATE_LIMIT"
        : response.status >= 500
          ? "TN_AUDIO_SFX_PROVIDER_SERVER"
          : "TN_AUDIO_SFX_PROVIDER_REJECTED";
    const raw = (await response.text()).slice(0, maximumErrorBodyBytes);
    const detail = sanitizeProviderDetail(raw);
    throw new ElevenLabsSfxError(code, `ElevenLabs returned HTTP ${response.status}${detail.length > 0 ? `: ${detail}` : "."}`);
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (request.maximumResponseBytes !== undefined && Number.isFinite(contentLength) && contentLength > request.maximumResponseBytes) {
    throw new ElevenLabsSfxError("TN_AUDIO_SFX_RESPONSE_TOO_LARGE", `ElevenLabs response exceeds the ${request.maximumResponseBytes}-byte limit.`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (request.maximumResponseBytes !== undefined && bytes.byteLength > request.maximumResponseBytes) {
    throw new ElevenLabsSfxError("TN_AUDIO_SFX_RESPONSE_TOO_LARGE", `ElevenLabs response exceeds the ${request.maximumResponseBytes}-byte limit.`);
  }
  return {
    bytes,
    characterCost: response.headers.get("character-cost") ?? response.headers.get("x-character-cost") ?? undefined,
    contentType: response.headers.get("content-type") ?? "",
    requestId: response.headers.get("request-id") ?? response.headers.get("x-request-id") ?? undefined,
  };
}

function sanitizeProviderDetail(value: string): string {
  return value
    .replace(/(xi-api-key|authorization)["'\s:=]+[^\s,"'}]+/giu, "$1 [redacted]")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .trim();
}
