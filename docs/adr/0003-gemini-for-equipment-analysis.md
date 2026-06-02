# Gemini (Google AI Studio) for Equipment photo analysis

The Equipment photo feature needs a vision-capable LLM to analyze equipment photos and suggest exercises. We chose Gemini 2.0 Flash via the Google AI Studio API rather than the Claude API.

Claude API was the natural first choice given the project tooling, but the cost difference is significant for a feature that runs on every Equipment upload (vision calls are expensive on Claude). Gemini 2.0 Flash handles image input with structured output (`response_mime_type: application/json`) at a fraction of the cost, and the quality for "what exercises can I do on this machine" is more than sufficient. The API key is stored server-side only (`GEMINI_API_KEY` env var); the browser never touches the AI provider directly.
