// Base64 decoding
function atobUint8(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Decodes raw PCM data from Gemini into an AudioBuffer
export async function decodeAudioData(
  base64Data: string,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const bytes = atobUint8(base64Data);
  const dataInt16 = new Int16Array(bytes.buffer);
  
  // Create an empty buffer
  const buffer = ctx.createBuffer(numChannels, dataInt16.length, sampleRate);
  
  // Fill the channel data (converting 16-bit int to float -1..1)
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  
  return buffer;
}

// Helper to create an AudioContext singleton if needed, though usually managed in React state/refs
let sharedAudioContext: AudioContext | null = null;

export const getAudioContext = (): AudioContext => {
  if (!sharedAudioContext) {
    sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000, 
    });
  }
  return sharedAudioContext;
};
