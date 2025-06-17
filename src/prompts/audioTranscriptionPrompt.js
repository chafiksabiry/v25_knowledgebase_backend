function generateAudioTranscriptionPrompt() {
  return `You are given an audio recording. Your task is to generate a highly accurate **timestamped transcription** of the speech only. Follow these strict instructions:

1. **Split the audio into fine-grained segments**, each covering a **natural sentence or short phrase** (preferably 2–6 seconds).
2. For each segment, include:
   - "start": the exact moment the speaker begins talking (format: mm:ss.SSS).
   - "end": the exact moment the speaker stops talking (format: mm:ss.SSS).
   - "speaker": the speaker identity if possible (e.g., "Speaker 1", "Speaker 2").
   - "text": the exact spoken words in that time range.

⚠️ CRITICAL ACCURACY REQUIREMENTS:
- Timestamps must **precisely match the actual audio timing**, **within ±300 milliseconds** of the real speech start and end.
- Never allow timestamps to drift more than 0.3 seconds from the true speech timing.
- Do not round or estimate durations — compute based on audio cues.
- Do not merge multiple distinct sentences into a single long segment.
- Do not guess or invent speech. Only transcribe what is clearly heard.
- Background noise, silence, music, or breathing must be excluded.
- No hallucinated or implied words — only actual audible speech.
- Segments must not overlap or leave large gaps.

✅ Output format: a valid JSON array of the form:
[
  {
    "start": "00:00.000",
    "end": "00:04.321",
    "speaker": "Speaker 1",
    "text": "Bonjour, comment puis-je vous aider ?"
  },
  ...
]`;
}

module.exports = { generateAudioTranscriptionPrompt };