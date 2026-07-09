# PRD-001 UI Action Delivery Evidence

Browser smoke run: Playwright against a temporary `startWebPreview` bundle.

- Preview readiness: `window.__THREENATIVE_READY__.ok === true`
- Console: no errors after the valid bundle reload
- Screenshot evidence:
  - `screenshots/before.png`
  - `screenshots/after.png`
- Script-observed hit frames after interacting with real DOM controls:

```json
[
  {
    "start": true,
    "volume": false,
    "actions": [{ "action": "StartGame", "node": "start" }]
  },
  {
    "start": false,
    "volume": true,
    "actions": [{ "action": "SetVolume", "node": "volume", "value": 0.75 }]
  }
]
```

Later sampled frames returned empty action arrays, proving no duplicate
delivery across frames in this smoke.
