export interface IAnimationPlayRequest {
  clip: string;
  entity: string;
  options: Record<string, unknown>;
}

import type { IAnimationRuntimeState } from "../../animation.js";

export type IAnimationPlayResult = IAnimationRuntimeState & {
  accepted: true;
};

export interface IAnimationStopRequest {
  clip?: string;
  entity: string;
}

export type IAnimationStopResult = IAnimationRuntimeState & {
  accepted: true;
};

export interface IAnimationQueryRequest {
  clip?: string;
  entity: string;
}

export type IAnimationQueryResult = IAnimationRuntimeState;

export function animationPlayPayload(request: IAnimationPlayRequest, result: IAnimationRuntimeState): {
  request: IAnimationPlayRequest;
  result: IAnimationPlayResult;
} {
  return {
    request,
    result: { ...result, accepted: true },
  };
}

export function animationStopPayload(request: IAnimationStopRequest, result: IAnimationRuntimeState): {
  request: IAnimationStopRequest;
  result: IAnimationStopResult;
} {
  return {
    request,
    result: { ...result, accepted: true },
  };
}

export function animationQueryPayload(request: IAnimationQueryRequest, result: IAnimationRuntimeState): {
  request: IAnimationQueryRequest;
  result: IAnimationQueryResult;
} {
  return {
    request,
    result,
  };
}
