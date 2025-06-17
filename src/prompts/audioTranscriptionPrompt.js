// audioTranscriptionPrompt.js

function generateAudioTranscriptionPrompt() {
  return `Generate an accurate transcription of the audio content. For each speech segment, include:

- The **start** and **end** times in the format **mm:ss.SSS** (e.g., "00:00.000", "03:14.123").
- The **speaker label**, if distinguishable (e.g., "Speaker 1", "Speaker 2").
- The **spoken text**.

⚠️ IMPORTANT:
- All timestamps **must** be within the actual duration of the audio file.
- Ignore non-speech background sounds (music, noise, etc.).
- Do **not** include empty or silent segments.
- Do **not** generate or hallucinate speech that is not actually present.
- Ensure timestamp formatting is precise to the **millisecond**.

Return the result as a **JSON array**. Each item must be in the format:
{ "start": "00:00.000", "end": "00:10.500", "speaker": "Speaker 1", "text": "..." }`;
}


module.exports = { generateAudioTranscriptionPrompt }; 