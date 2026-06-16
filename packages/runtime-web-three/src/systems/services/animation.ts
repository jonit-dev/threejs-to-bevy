export interface IAnimationPlayRequest {
  clip: string;
  entity: string;
  options: Record<string, unknown>;
}

export interface IAnimationPlayResult {
  accepted: true;
}

export interface IAnimationStopRequest {
  clip?: string;
  entity: string;
}

export interface IAnimationStopResult {
  accepted: true;
  stopped: true;
}

export interface IAnimationQueryRequest {
  clip?: string;
  entity: string;
}

export interface IAnimationQueryResult {
  active: boolean;
  clip?: string;
  entity: string;
  paused: boolean;
  stopped: boolean;
  timeSeconds: number;
}

export function animationPlayPayload(request: IAnimationPlayRequest): {
  request: IAnimationPlayRequest;
  result: IAnimationPlayResult;
} {
  return {
    request,
    result: { accepted: true },
  };
}

export function animationStopPayload(request: IAnimationStopRequest): {
  request: IAnimationStopRequest;
  result: IAnimationStopResult;
} {
  return {
    request,
    result: { accepted: true, stopped: true },
  };
}

export function animationQueryPayload(request: IAnimationQueryRequest): {
  request: IAnimationQueryRequest;
  result: IAnimationQueryResult;
} {
  return {
    request,
    result: {
      active: false,
      ...(request.clip === undefined ? {} : { clip: request.clip }),
      entity: request.entity,
      paused: false,
      stopped: true,
      timeSeconds: 0,
    },
  };
}
