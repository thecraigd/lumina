export interface VoiceOption {
  name: string;
  gender: string;
  style: string;
}

export interface AudioChunk {
  id: string;
  text: string;
  buffer: AudioBuffer | null;
  status: 'pending' | 'generating' | 'ready' | 'playing' | 'played' | 'error';
}

export interface PlayerState {
  isPlaying: boolean;
  currentChunkIndex: number;
  speed: number;
  selectedVoice: string;
}

export interface DocumentSection {
  id: string;
  title: string;
  summary?: string;
  cue?: string;
}

export interface FilePayload {
  base64: string;
  mimeType: string;
  name: string;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  // Make aistudio optional on window
  interface Window {
    aistudio?: AIStudio;
  }
}
