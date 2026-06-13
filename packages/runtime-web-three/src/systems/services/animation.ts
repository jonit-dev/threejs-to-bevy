export interface IAnimationPlayRequest {
  clip: string;
  entity: string;
  options: Record<string, unknown>;
}

export interface IAnimationPlayResult {
  accepted: true;
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
