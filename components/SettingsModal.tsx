import React from 'react';
import { VOICES } from '../constants';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  selectedVoice,
  onVoiceChange,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-ink/50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-white border border-ink/20 rounded-2xl shadow-luxe overflow-hidden animate-rise">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-ink/15 bg-paper">
          <h2 className="text-xl font-semibold text-ink tracking-[-0.02em]">Settings</h2>
          <button 
            onClick={onClose}
            className="p-2 text-ink/50 hover:text-ink hover:bg-ink/5 rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-ink/50 uppercase tracking-[0.2em]">
              Narrator Voice
            </label>
            <div className="grid gap-2">
              {VOICES.map((voice) => (
                <button
                  key={voice.name}
                  onClick={() => onVoiceChange(voice.name)}
                  className={`
                    flex items-center justify-between p-3 rounded-xl border transition-all
                    ${selectedVoice === voice.name 
                      ? 'bg-accent/10 border-accent/60 text-ink shadow-glow' 
                      : 'bg-white border-transparent text-ink/60 hover:border-ink/15 hover:bg-paper'
                    }
                  `}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-semibold">{voice.name}</span>
                    <span className="text-xs opacity-70">{voice.gender}, {voice.style}</span>
                  </div>
                  {selectedVoice === voice.name && (
                    <div className="text-accent">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;
