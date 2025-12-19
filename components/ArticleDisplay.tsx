import React from 'react';

interface ArticleDisplayProps {
  chunks: string[];
  currentChunkIndex: number;
  isPlaying: boolean;
  isPaused: boolean;
  onChunkClick: (index: number) => void;
}

const ArticleDisplay: React.FC<ArticleDisplayProps> = ({ 
  chunks, 
  currentChunkIndex,
  isPlaying,
  isPaused,
  onChunkClick
}) => {
  if (chunks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-80 text-slate-500 border border-dashed border-white/10 rounded-3xl bg-white/5 backdrop-blur-sm">
        <svg className="w-12 h-12 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
        <p className="font-medium">Waiting for content...</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-3xl p-8 sm:p-10 shadow-2xl shadow-black/50 mb-32 relative overflow-hidden">
      {/* Subtle top sheen */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>

      <div className="space-y-8 font-serif text-xl sm:text-2xl leading-loose text-slate-300">
        {chunks.map((chunk, index) => {
          const isCurrent = index === currentChunkIndex;
          const isActive = isCurrent && (isPlaying || isPaused);
          const isPast = index < currentChunkIndex;
          
          return (
            <div 
              key={index}
              onClick={() => onChunkClick(index)}
              className={`
                relative p-6 rounded-2xl transition-all duration-500 cursor-pointer group
                ${isActive 
                  ? 'bg-indigo-500/10 text-indigo-50 shadow-lg shadow-indigo-900/20' 
                  : 'hover:bg-white/5 hover:text-slate-100 text-slate-400'
                }
              `}
            >
              {/* Active Marker */}
              {isActive && (
                <div className="absolute left-0 top-6 bottom-6 w-1 bg-indigo-500 rounded-r-full shadow-[0_0_10px_rgba(99,102,241,0.6)]"></div>
              )}
              
              <p className={`relative z-10 ${isPast && !isActive ? 'opacity-60' : ''}`}>
                {chunk}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ArticleDisplay;