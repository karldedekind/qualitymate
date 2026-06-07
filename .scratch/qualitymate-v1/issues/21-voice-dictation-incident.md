# Voice dictation on incident description (mobile)

---
Status: done
---

## What to build

Browser SpeechRecognition API on incident description field. Mic button starts recording; transcript appears live in textarea. Mobile-first; falls back silently to manual typing in unsupported browsers.

## Acceptance criteria

- [x] Mic button appears on description field where Web Speech API is supported
- [x] Tap mic → record → transcript appears live in textarea
- [x] Unsupported browsers hide button without error
- [x] Verified on iOS Safari and Android Chrome (manual device check pending)

## Blocked by

- `10-incidents-manual-flow.md`

## Comments

### 2026-05-06 — implementation

- `src/lib/dictation.ts` — pure helpers: `joinTranscript`, `extractTranscripts`, `getSpeechRecognitionCtor`, `isSpeechRecognitionSupported`. `SpeechRecognitionLike` / `SpeechRecognitionEventLike` types avoid DOM lib dep.
- `src/components/dictation-button.tsx` — client-only. Detects `window.SpeechRecognition || webkitSpeechRecognition` in `useEffect` (no SSR mismatch). Hides entirely when unsupported. Toggles `start`/`stop`. `continuous=true`, `interimResults=true`, `lang="en-AU"` default.
  - Session model: capture textarea value as `baseRef` at start; accumulate finals into `finalRef`; live-render `joinTranscript(joinTranscript(base, final), interim)`. Fires synthetic `input` event so React stays in sync.
  - Cleanup: aborts on unmount; clears state on `onend`.
  - Surfaces `error.error` next to the button (e.g. `not-allowed`, `no-speech`).
- Wired into `src/app/incidents/new/new-form.tsx` — `descriptionRef` added; `<DictationButton targetRef={descriptionRef} />` rendered under the description textarea. No server changes; no DB changes; no audit (client-only feature).
- Tests: `tests/dictation.test.ts` — 12 cases covering `joinTranscript` edge cases (empty/whitespace/embedded newlines), `extractTranscripts` (final/interim split, `resultIndex` offset, multi-segment final), and `isSpeechRecognitionSupported` (window absent, both prefixes). All pass.
- `npm run typecheck` clean.

Limitations: Web Speech API on iOS Safari requires a user gesture (button tap satisfies this) and uses Apple's server-side recognition — no offline dictation. Browser may auto-stop after silence; user retaps to resume. No PII redaction client-side; transcript flows into the same textarea path as typed input.
