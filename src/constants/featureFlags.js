/**
 * Feature toggles (ship with safe defaults; enable locally when needed).
 *
 * AI assistant (Gemini): deprecated in production UI. Set to `true` and add
 * `REACT_APP_GEMINI_API_KEY` in `.env` (never commit the key) to use again.
 */
export const AI_ASSISTANT_ENABLED = false;
