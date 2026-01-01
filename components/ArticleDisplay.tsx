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
      <div className="paper-stack glass-panel rounded-[18px] p-8 sm:p-10 shadow-luxe">
        <div className="flex flex-col items-center justify-center h-72 text-ink/50 border border-dashed border-ink/20 rounded-[14px] bg-newsprint">
          <svg className="w-12 h-12 mb-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>
          <p className="font-medium">Waiting for content...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="paper-stack glass-panel rounded-[18px] p-8 sm:p-12 shadow-luxe mb-32 relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-ink/15"></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/15 pb-4 mb-8">
        <span className="text-[11px] font-semibold text-ink/50 tracking-[0.3em] uppercase">Story</span>
        <span className="text-[11px] font-semibold text-ink/40 tracking-[0.3em] uppercase">Tap a paragraph to jump</span>
      </div>

      <div className="space-y-8 font-serif text-lg sm:text-xl leading-relaxed text-ink/70">
        {chunks.map((chunk, index) => {
          const isCurrent = index === currentChunkIndex;
          const isActive = isCurrent && (isPlaying || isPaused);
          const isPast = index < currentChunkIndex;
          
          return (
            <div 
              key={index}
              onClick={() => onChunkClick(index)}
              className={`
                relative p-5 sm:p-6 border border-ink/10 border-l-4 transition-all duration-300 cursor-pointer group bg-paper
                ${isActive 
                  ? 'border-ink/20 border-l-accent bg-accent/10 text-ink shadow-glow' 
                  : 'border-ink/10 border-l-transparent text-ink/70 hover:border-ink/30 hover:bg-newsprint'
                }
              `}
            >
              {/* Active Marker */}
              {isActive && (
                <div className="absolute left-0 top-6 bottom-6 w-1 bg-accent shadow-[0_0_12px_rgba(30,144,255,0.45)]"></div>
              )}
              
              <p className={`relative z-10 ${index === 0 ? 'dropcap' : ''} ${isPast && !isActive ? 'opacity-60' : ''}`}>
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
