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