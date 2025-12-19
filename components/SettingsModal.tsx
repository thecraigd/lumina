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
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
          <h2 className="text-xl font-bold text-white tracking-tight">Settings</h2>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-400 uppercase tracking-wider">
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
                      ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-lg shadow-indigo-500/10' 
                      : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10 hover:text-slate-200'
                    }
                  `}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-semibold">{voice.name}</span>
                    <span className="text-xs opacity-70">{voice.gender}, {voice.style}</span>
                  </div>
                  {selectedVoice === voice.name && (
                    <div className="text-indigo-400">
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