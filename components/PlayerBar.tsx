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
    <div className="fixed bottom-6 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-3xl z-50 animate-rise" style={{animationDuration: '0.4s'}}>
      <div className="rounded-[16px] p-2 pr-3 flex items-center justify-between gap-3 bg-ink text-paper shadow-luxe border border-ink/80">
        
        {/* Play/Pause Button */}
        <button
          onClick={onTogglePlay}
          disabled={disabled}
          className={`
            flex-1 flex items-center justify-center gap-3 px-8 py-4 rounded-[12px] font-semibold uppercase tracking-[0.28em] transition-all duration-300 active:scale-[0.98] group relative overflow-hidden
            disabled:opacity-50 disabled:cursor-not-allowed
            ${isPlaying 
              ? 'bg-paper text-ink border border-paper hover:bg-newsprint' 
              : 'bg-accent text-white hover:bg-accent/90 shadow-glow border-2 border-ink'
            }
          `}
        >
          {/* Button shine effect */}
          {!isPlaying && <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12"></div>}
          
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
        <div className="h-8 w-px bg-paper/30"></div>

        {/* Speed Dropdown */}
        <div className="relative min-w-[110px] group">
          <select
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full appearance-none bg-transparent text-paper/80 py-3 pl-4 pr-8 rounded-full font-semibold focus:outline-none focus:text-paper transition-colors cursor-pointer text-center hover:bg-paper/10"
          >
            {PLAYBACK_SPEEDS.map((s) => (
              <option key={s} value={s} className="bg-ink text-paper">
                {s}x
              </option>
            ))}
          </select>
           <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center px-2 text-paper/50 group-hover:text-accent transition-colors">
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
