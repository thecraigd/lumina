import React from 'react';
import { PLAYBACK_SPEEDS } from '../constants';

interface PlayerBarProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  disabled: boolean;
  label: string; 
}

const PlayerBar: React.FC<PlayerBarProps> = ({
  isPlaying,
  onTogglePlay,
  speed,
  onSpeedChange,
  disabled,
  label
}) => {
  return (
    <div className="fixed bottom-8 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl z-50 animate-fade-in" style={{animationDuration: '0.3s'}}>
      <div className="glass-panel rounded-full p-2 pr-3 flex items-center justify-between gap-3 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] bg-slate-900/80">
        
        {/* Play/Pause Button */}
        <button
          onClick={onTogglePlay}
          disabled={disabled}
          className={`
            flex-1 flex items-center justify-center gap-3 px-8 py-4 rounded-full font-bold tracking-wider transition-all duration-300 active:scale-95 group relative overflow-hidden
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isPlaying 
              ? 'bg-slate-800 text-white border border-white/10 hover:bg-slate-700' 
              : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/25'
            }
          `}
        >
          {/* Button shine effect */}
          {!isPlaying && <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"></div>}
          
          {isPlaying ? (
            <>
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              <span>PAUSE</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              <span>{label.toUpperCase()}</span>
            </>
          )}
        </button>

        {/* Separator */}
        <div className="h-8 w-px bg-white/10"></div>

        {/* Speed Dropdown */}
        <div className="relative min-w-[110px] group">
          <select
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full appearance-none bg-transparent text-slate-300 py-3 pl-4 pr-8 rounded-full font-semibold focus:outline-none focus:text-white transition-colors cursor-pointer text-center hover:bg-white/5"
          >
            {PLAYBACK_SPEEDS.map((s) => (
              <option key={s} value={s} className="bg-slate-900 text-slate-300">
                {s}x
              </option>
            ))}
          </select>
           <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center px-2 text-slate-500 group-hover:text-indigo-400 transition-colors">
            <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
            </svg>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PlayerBar;