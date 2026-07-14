# Hyper3D Rodin Provider Review (2026-07-14)

## Decision

Keep Rodin Gen-2 experimental and explicitly opt-in. ThreeNative may expose
one-shot status, submit, poll, and import operations, but must not hide cost,
terms, input-rights acknowledgement, polling, or download behavior.

## Official sources reviewed

- [Rodin Gen-2 generation](https://developer.hyper3d.ai/api-specification/rodin-generation-gen2): bearer-authenticated multipart submission, GLB/PBR options, top-level task UUID, per-job subscription key, documented 0.5-credit base cost, and Business-plan requirement.
- [Check status](https://developer.hyper3d.ai/api-specification/check-status): status uses the subscription key, is asynchronous, warns clients against frequent polling, may throttle, and has no extra credit cost.
- [Download results](https://developer.hyper3d.ai/api-specification/download-results): download lookup uses the task UUID after completion and has no extra credit cost.
- [Data policy](https://developer.hyper3d.ai/legal/data-policy): API input and generated data are retained for seven days and are not used for training or shared under the published policy.
- [Terms](https://hyper3d.ai/legal/terms): users warrant the necessary input rights; output use remains subject to the terms, law, and third-party rights; copyrightability and non-infringement are not guaranteed.
- [Pricing](https://hyper3d.ai/pricing): Business-plan API access and plan-specific request-per-minute figures are pricing-page facts and therefore drift-sensitive.

## Contract consequences

- Require separate cost, provider-terms, and input-rights acknowledgements before submission.
- Accept exactly one bounded text prompt or validated project-local image.
- Reserve the local job ID before the paid request and retain returned task identifiers for fail-closed recovery.
- Keep durable job JSON non-secret. Store the subscription key only in a mode-0600 project-local `.secret.json` sidecar used by explicit polling.
- Never emit API keys, subscription keys, or signed download URLs to stdout, source documents, bundles, provenance, or verification evidence.
- Poll once per command, never recursively. Users and automation must poll conservatively, honor HTTP 429 `Retry-After`, and review current provider limits before scripting calls.
- Download only a provider-declared GLB from an allowlisted HTTPS host, with redirect, byte, MIME, GLB-signature, inspection, and cleanup bounds.
- Treat provider output as requiring user review; ThreeNative does not assert copyrightability, exclusivity, or freedom from third-party rights.

## Deferred

Live text and image submissions require user-provided credentials, explicit
cost authority, and retained visual review. Hunyuan generation remains
unsupported until its hosted transport, charge semantics, and output-rights
evidence pass the same review.
