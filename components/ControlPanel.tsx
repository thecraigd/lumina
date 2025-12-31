import React from 'react';
import { VOICES } from '../constants';

interface ControlPanelProps {
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  disabled?: boolean;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  selectedVoice,
  onVoiceChange,
  disabled = false,
}) => {
  return (
    <div className="glass-panel rounded-2xl p-1">
      <div className="bg-paper rounded-xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 border border-ink/15">
        
        <div className="flex items-center gap-3 text-ink/70">
           <div className="p-2 bg-accent/10 rounded-lg text-accent">
             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
           </div>
           <span className="text-sm font-semibold tracking-[0.2em] uppercase text-ink/50">Narrator Voice</span>
        </div>

        <div className="relative flex-1 w-full sm:w-auto sm:max-w-xs group">
          <select
            value={selectedVoice}
            onChange={(e) => onVoiceChange(e.target.value)}
            disabled={disabled}
            className="w-full appearance-none bg-white border border-ink/20 text-ink py-3 pl-4 pr-10 rounded-lg focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium cursor-pointer hover:bg-paper"
          >
            {VOICES.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name} — {voice.gender}, {voice.style}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-accent">
            <svg className="fill-current h-4 w-4 transition-transform group-hover:scale-110" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
            </svg>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ControlPanel;
