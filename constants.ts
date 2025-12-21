export const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
export const TEXT_MODEL = 'gemini-3-flash-preview';

export const VOICES = [
  { name: 'Charon', gender: 'Male', style: 'Deep, Resonant' },
  { name: 'Puck', gender: 'Male', style: 'Soft, Deep' },
  { name: 'Kore', gender: 'Female', style: 'Calm, Soothing' },
  { name: 'Fenrir', gender: 'Male', style: 'Rough, Intense' },
  { name: 'Zephyr', gender: 'Female', style: 'Clear, Bright' },
];

export const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

export const SAMPLE_RATE = 24000; // Gemini TTS standard output sample rate
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB guardrail for local file uploads
