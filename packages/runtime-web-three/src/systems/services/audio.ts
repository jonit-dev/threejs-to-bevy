import type { IScriptAudioRuntimeState } from "../../audio.js";
import type { IScriptAudioUpdateOptions } from "@threenative/ir";

export interface IAudioPlayRequest {
  options: Record<string, unknown>;
  soundId: string;
}

export type IAudioPlayResult = IScriptAudioRuntimeState & {
  accepted: true;
};

export interface IAudioStopRequest {
  playbackId: string;
}

export type IAudioStopResult = IScriptAudioRuntimeState & {
  accepted: true;
};

export interface IAudioQueryRequest {
  playbackId: string;
}

export type IAudioQueryResult = IScriptAudioRuntimeState;

export interface IAudioUpdateRequest {
  options: IScriptAudioUpdateOptions;
  playbackId: string;
}

export function audioPlayPayload(request: IAudioPlayRequest, result: IScriptAudioRuntimeState): {
  request: IAudioPlayRequest;
  result: IAudioPlayResult | IScriptAudioRuntimeState;
} {
  return {
    request,
    result: result.accepted ? { ...result, accepted: true } : result,
  };
}

export function audioStopPayload(request: IAudioStopRequest, result: IScriptAudioRuntimeState): {
  request: IAudioStopRequest;
  result: IAudioStopResult;
} {
  return {
    request,
    result: { ...result, accepted: true },
  };
}

export function audioQueryPayload(request: IAudioQueryRequest, result: IScriptAudioRuntimeState): {
  request: IAudioQueryRequest;
  result: IAudioQueryResult;
} {
  return {
    request,
    result,
  };
}

export function audioUpdatePayload(request: IAudioUpdateRequest, result: IScriptAudioRuntimeState): {
  request: IAudioUpdateRequest;
  result: IScriptAudioRuntimeState;
} {
  return { request, result };
}
