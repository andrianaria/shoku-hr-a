# Shoku HR Demo

A standalone copy of the payroll and THR screens from Shoku HR. It runs on
localhost with fictional employees, locations, and payroll amounts. The demo
includes payroll drafts, per-employee adjustments, THR generation, and XLSX
exports.

## Run locally

Use Node.js 22.18 or newer.

```sh
npm ci
npm run dev
```

Open [the payroll page](http://127.0.0.1:3000/payroll). The demo has no login or
external integrations. Changes are stored in memory and reset when the server
restarts. Marking a run paid updates the demo status.

## Checks

```sh
npm test
npm run build
npm run typecheck
```

The demo includes source adapted from the existing Shoku HR payroll screens.
It is licensed under [MIT](LICENSE). See
[third-party notices](THIRD_PARTY_NOTICES.md) for adapted UI components.
