# Flight School Local iBar

Client-side microLM intent routing demo for a fictional flight school application.

## What This PoC Demonstrates

This PoC demonstrates that a static browser-hosted aviation training application can use a client-side embedded microLM to classify constrained iBar commands, extract domain slots, match those slots against a local manifest, check simulated permissions, and route the user to an approved UI destination or workflow.

Architecture principle:

- The microLM interprets language.
- The manifest defines what exists.
- The resolver decides what is allowed.
- The permission layer controls access.
- The UI performs safe handoff.
- The user remains in control.

## Important Boundaries

This is a static frontend PoC.

It has no backend.
It has no database.
It performs no hosted LLM inference.
It does not use OpenAI, Anthropic, Gemini, or any cloud LLM inference API.
It has no API keys and no secrets.
It does not require real authentication.

The local microLM is used only for constrained intent parsing. The manifest and resolver remain authoritative. All aviation data is fictional sample data. The system does not make real training, safety, compliance, or certification decisions.

## What Runs Locally

- React + Vite + TypeScript application
- Tailwind CSS UI
- Static JSON data for students, instructors, debriefs, permissions, vocabulary, manifest, and demo commands
- Transformers.js browser-side model adapter for `HuggingFaceTB/SmolLM2-360M-Instruct`
- Deterministic fallback parser
- Manifest resolver and simulated permission checks
- In-memory demo telemetry and draft remedial plan state that reset on browser reload

Cloud LLM calls remain `0`.

## What Is Simulated

- Role selection
- Permissions
- Student records
- Debrief records
- Risk flags
- Route handoff
- Remedial plan preparation
- Telemetry

Remedial plan submission is simulated only and never writes to a server.

## Out Of Scope

- Real Discovery Engine
- Source-code scanner
- Database scanner
- Real authentication
- Real student record persistence
- Real remedial plan submission
- Real aviation safety recommendation engine
- Backend proxy or serverless functions
- Real student data

## Run Locally

```bash
npm install
npm run dev
```

Open the local Vite URL shown in your terminal.

## Build

```bash
npm run build
```

The static build output is written to `dist`.

## Deploy To Netlify

Use:

- Build command: `npm run build`
- Publish directory: `dist`

`netlify.toml` includes a single-page-app redirect and static headers for browser model execution.

## Required Demo Commands

Use the iBar or the demo test panel:

- `Show students with unstable approach issues this week`
- `Open Emma Johnson's last debrief`
- `Start remedial training for Noah Carter on crosswind landings`
- `Show students ready for stage check`
- `Find students not ready for solo`
- `Show Sarah Collins' students needing review`
- `Open Miller's debrief`
- `Open debrief from yesterday`
- `Show weak students in landings`
- `Delete Emma's record`

Expected highlights:

- Unstable approach routes to Risk Dashboard and shows Emma Johnson.
- Emma's latest debrief opens the debrief detail.
- Noah's remedial command launches the wizard with local prefill.
- Stage check readiness shows Liam Brooks.
- Miller's debrief asks for disambiguation between Ethan Miller and Jackson Miller.
- Destructive commands are blocked.
- Principal role is denied when attempting to create remedial plans.

## Debugging The iBar

Open `Manifest Viewer` to inspect:

- Raw command
- Parser used: Local microLM or Fallback parser
- Intent type
- Extracted slots
- Matched manifest candidate
- Confidence
- Permission outcome
- Response state
- Final handoff target
- Cloud LLM calls: 0
- Last 10 local telemetry events
- Demo test pass/fail results

User-entered demo content is intentionally transient. iBar text clears after execution, and browser reload resets role selection, iBar results, telemetry, and remedial draft edits.

The model never directly navigates the app. Resolver validation is required before every route handoff.
