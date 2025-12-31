import React, { useState, useRef, useEffect, useCallback } from 'react';
import ArticleDisplay from './components/ArticleDisplay';
import PlayerBar from './components/PlayerBar';
import SettingsModal from './components/SettingsModal';
import { extractTextFromUrl, generateSpeechChunk } from './services/geminiService';
import { decodeAudioData, getAudioContext } from './utils/audioUtils';
import { SAMPLE_RATE, VOICES } from './constants';

const App: React.FC = () => {
  // --- Auth State ---
  const [apiKey, setApiKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const [useManualKey, setUseManualKey] = useState(false);

  // --- App State ---
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [mode, setMode] = useState<'url' | 'text'>('url');
  
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [textChunks, setTextChunks] = useState<string[]>([]);
  const [audioBuffers, setAudioBuffers] = useState<(AudioBuffer | null)[]>([]);
  
  // Playback State
  const [currentChunkIndex, setCurrentChunkIndex] = useState(-1);
  const [status, setStatus] = useState<'idle' | 'playing' | 'paused'>('idle');

  // User Settings
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].name);
  const [speed, setSpeed] = useState(1.0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- Refs (For async consistency) ---
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const chunkStartTimeRef = useRef<number>(0);
  const chunkStartOffsetRef = useRef<number>(0);
  const chunkPlaybackRateRef = useRef<number>(speed);
  const resumeOffsetRef = useRef<number>(0);
  
  // Logic refs
  // playbackSessionIdRef ensures we only run ONE playback loop at a time. 
  // If the ID changes, any running loops abort immediately.
  const playbackSessionIdRef = useRef<number>(0); 
  
  const audioBuffersRef = useRef<(AudioBuffer | null)[]>([]);
  const textChunksRef = useRef<string[]>([]);
  const selectedVoiceRef = useRef(selectedVoice);
  const speedRef = useRef(speed);
  const apiKeyRef = useRef(apiKey);
  
  const processingChunksRef = useRef<Set<number>>(new Set());

  // --- Effects ---

  // 1. Check for API Key on mount
  useEffect(() => {
    const checkKey = async () => {
      try {
        if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
          setIsAuthenticated(true);
          if (typeof process !== 'undefined' && process.env.API_KEY) {
             setApiKey(process.env.API_KEY);
          }
        } else {
          setUseManualKey(true);
          const storedKey = localStorage.getItem('gemini_api_key');
          if (storedKey) {
            setApiKey(storedKey);
            setIsAuthenticated(true);
          }
        }
      } catch (e) {
        console.error("Failed to check API key", e);
        setUseManualKey(true);
      } finally {
        setIsCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  // 2. Sync Refs
  useEffect(() => { audioBuffersRef.current = audioBuffers; }, [audioBuffers]);
  useEffect(() => { textChunksRef.current = textChunks; }, [textChunks]);
  useEffect(() => { selectedVoiceRef.current = selectedVoice; }, [selectedVoice]);
  useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);
  useEffect(() => { 
    speedRef.current = speed; 
    if (activeSourceRef.current) {
      try {
        const ctx = audioContextRef.current;
        if (ctx) {
          const now = ctx.currentTime;
          if (now > chunkStartTimeRef.current) {
            const elapsed = now - chunkStartTimeRef.current;
            const rateAtStart = chunkPlaybackRateRef.current || speed;
            chunkStartOffsetRef.current += elapsed * rateAtStart;
            chunkStartTimeRef.current = now;
            const duration = activeSourceRef.current.buffer?.duration;
            if (duration && chunkStartOffsetRef.current > duration) {
              chunkStartOffsetRef.current = duration;
            }
          }
        }
        activeSourceRef.current.playbackRate.value = speed;
      } catch(e) {}
    }
    chunkPlaybackRateRef.current = speed;
  }, [speed]);

  // --- Actions ---

  const handleConnectApiKey = async () => {
    try {
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        setIsAuthenticated(true);
        if (typeof process !== 'undefined' && process.env.API_KEY) {
            setApiKey(process.env.API_KEY);
        }
      }
    } catch (e: any) {
      console.error("Key selection failed", e);
      if (e.message && e.message.includes('Requested entity was not found')) {
         await window.aistudio?.openSelectKey();
         setIsAuthenticated(true);
      }
    }
  };

  const handleManualKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim().length > 10) {
      localStorage.setItem('gemini_api_key', apiKey.trim());
      setIsAuthenticated(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('gemini_api_key');
    setApiKey('');
    setIsAuthenticated(false);
  };

  const chunkText = (text: string): string[] => {
    const maxLength = 1200; // Keep chunks manageable for TTS
    const normalized = text.replace(/\r\n/g, '\n');
    const paragraphs = normalized
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const chunks: string[] = [];
    paragraphs.forEach(p => {
      if (p.length <= maxLength) {
        chunks.push(p);
        return;
      }
      for (let i = 0; i < p.length; i += maxLength) {
        chunks.push(p.slice(i, i + maxLength));
      }
    });

    return chunks;
  };

  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = getAudioContext();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }, []);

  const stopPlayback = useCallback((pauseOnly = false) => {
    if (pauseOnly) {
      const ctx = audioContextRef.current;
      const buffer = activeSourceRef.current?.buffer;
      if (ctx && buffer) {
        const elapsed = Math.max(0, ctx.currentTime - chunkStartTimeRef.current);
        const rate = chunkPlaybackRateRef.current || speedRef.current;
        const duration = buffer.duration;
        let nextOffset = chunkStartOffsetRef.current + elapsed * rate;
        if (duration > 0) {
          nextOffset = Math.min(Math.max(nextOffset, 0), duration);
        } else {
          nextOffset = 0;
        }
        resumeOffsetRef.current = nextOffset;
      } else {
        resumeOffsetRef.current = 0;
      }
    } else {
      resumeOffsetRef.current = 0;
      chunkStartOffsetRef.current = 0;
      chunkStartTimeRef.current = 0;
    }

    // 1. Invalidate any running loops
    playbackSessionIdRef.current += 1;

    // 2. Aggressively kill the current sound
    if (activeSourceRef.current) {
      try { 
        activeSourceRef.current.stop(); 
        activeSourceRef.current.disconnect();
      } catch (e) { /* ignore */ }
      activeSourceRef.current = null;
    }

    // 3. Update UI state
    if (pauseOnly) {
      setStatus('paused');
    } else {
      setStatus('idle');
      setCurrentChunkIndex(-1);
      nextStartTimeRef.current = 0;
    }
  }, []);

  // --- Buffering Strategy ---

  const prefetchWindow = async (startIndex: number, windowSize = 3) => {
    const chunks = textChunksRef.current;
    const voiceAtStart = selectedVoiceRef.current;
    const keyToUse = apiKeyRef.current;

    for (let i = startIndex; i < startIndex + windowSize; i++) {
      if (i >= chunks.length) break;

      if (audioBuffersRef.current[i]) continue;
      if (processingChunksRef.current.has(i)) continue;

      processingChunksRef.current.add(i);

      generateSpeechChunk(chunks[i], voiceAtStart, keyToUse)
        .then(async (base64) => {
          // If the voice changed while we were fetching, discard this chunk
          if (selectedVoiceRef.current !== voiceAtStart) return;

          const ctx = audioContextRef.current || getAudioContext();
          const buffer = await decodeAudioData(base64, ctx, SAMPLE_RATE);
          
          setAudioBuffers(prev => {
            const newBuffers = [...prev];
            if (newBuffers.length > i) {
               newBuffers[i] = buffer;
            }
            return newBuffers;
          });
        })
        .catch((e) => console.warn(`Prefetch failed for chunk ${i}`, e))
        .finally(() => {
          processingChunksRef.current.delete(i);
        });
    }
  };

  const handleFetchContent = async () => {
    setError(null);
    setIsLoadingContent(true);
    stopPlayback(false); // Reset everything
    setAudioBuffers([]);
    setTextChunks([]);
    processingChunksRef.current.clear();

    try {
      let content = '';
      if (mode === 'url') {
        if (!url) throw new Error("Please enter a URL.");
        content = await extractTextFromUrl(url, apiKeyRef.current);
      } else {
        if (!rawText) throw new Error("Please enter some text.");
        content = rawText;
      }

      const chunks = chunkText(content);
      if (chunks.length === 0) throw new Error("No readable text found.");
      
      setTextChunks(chunks);
      setAudioBuffers(new Array(chunks.length).fill(null));
    } catch (err: any) {
      setError(err.message || "Failed to fetch content.");
    } finally {
      setIsLoadingContent(false);
    }
  };

  const playQueue = async (startIndex: number, startOffset = 0) => {
    if (startIndex >= textChunksRef.current.length) {
      stopPlayback(false);
      return;
    }

    // Capture the session ID for THIS specific playback loop
    const sessionId = playbackSessionIdRef.current;

    setStatus('playing');
    initAudio();
    const ctx = audioContextRef.current!;
    if (ctx.state === 'suspended') await ctx.resume();

    // Reset timing cursor if we are starting fresh (not just pausing)
    // However, for simplicity, we often just use currentTime + small buffer
    nextStartTimeRef.current = ctx.currentTime + 0.1;
    
    // Kick off prefetch
    prefetchWindow(startIndex);

    for (let i = startIndex; i < textChunksRef.current.length; i++) {
      // 1. CRITICAL: Check if this loop has been cancelled/superseded
      if (playbackSessionIdRef.current !== sessionId) {
        return; 
      }

      setCurrentChunkIndex(i);
      prefetchWindow(i + 1, 3);

      try {
        let buffer = audioBuffersRef.current[i];

        // If buffer is missing, we must fetch it now (blocking the loop)
        if (!buffer) {
          const voiceToUse = selectedVoiceRef.current;
          const textToUse = textChunksRef.current[i];
          const keyToUse = apiKeyRef.current;
          
          processingChunksRef.current.add(i);
          const base64 = await generateSpeechChunk(textToUse, voiceToUse, keyToUse);
          processingChunksRef.current.delete(i);
          
          // Check cancellation again after await
          if (playbackSessionIdRef.current !== sessionId) return;
          if (voiceToUse !== selectedVoiceRef.current) break; // Voice changed, abort

          buffer = await decodeAudioData(base64, ctx, SAMPLE_RATE);
          
          setAudioBuffers(prev => {
            const newBuffers = [...prev];
            newBuffers[i] = buffer;
            return newBuffers;
          });
        }

        // Check cancellation again
        if (playbackSessionIdRef.current !== sessionId) return;

        // Play the buffer and wait for it to finish
        const offset = i === startIndex ? startOffset : 0;
        await playBuffer(buffer, sessionId, offset);
        if (i === startIndex) {
          resumeOffsetRef.current = 0;
        }

      } catch (err) {
        console.error(`Error playing chunk ${i}`, err);
        // Only show error if we are still the active session
        if (playbackSessionIdRef.current === sessionId) {
          setError(`Playback error at paragraph ${i + 1}`);
          stopPlayback(true);
        }
        break;
      }
    }
    
    // If we finished the loop naturally and are still the active session
    if (playbackSessionIdRef.current === sessionId) {
      setStatus('idle');
      setCurrentChunkIndex(-1);
    }
  };

  const playBuffer = (buffer: AudioBuffer, sessionId: number, startOffset = 0): Promise<void> => {
    return new Promise((resolve) => {
      // Last check before emitting sound
      if (playbackSessionIdRef.current !== sessionId) {
        resolve(); // Resolve immediately to exit loop
        return;
      }

      const ctx = audioContextRef.current!;
      
      // Stop any existing source just in case (double safety)
      if (activeSourceRef.current) {
        try { activeSourceRef.current.stop(); } catch(e) {}
        activeSourceRef.current = null;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = speedRef.current;
      source.connect(ctx.destination);

      const duration = buffer.duration;
      const clampedOffset = Math.min(Math.max(startOffset, 0), duration);
      const remainingDuration = Math.max(0, duration - clampedOffset) / speedRef.current;

      // Ensure we don't schedule in the past
      if (nextStartTimeRef.current < ctx.currentTime) {
        nextStartTimeRef.current = ctx.currentTime;
      }

      if (remainingDuration === 0) {
        chunkStartOffsetRef.current = clampedOffset;
        chunkStartTimeRef.current = ctx.currentTime;
        chunkPlaybackRateRef.current = source.playbackRate.value;
        nextStartTimeRef.current += remainingDuration;
        resolve();
        return;
      }

      const startAt = nextStartTimeRef.current;
      source.start(startAt, clampedOffset);
      activeSourceRef.current = source;

      chunkStartOffsetRef.current = clampedOffset;
      chunkStartTimeRef.current = startAt;
      chunkPlaybackRateRef.current = source.playbackRate.value;

      nextStartTimeRef.current += remainingDuration;
      
      source.onended = () => {
        // Only resolve if we are still active; otherwise the loop is dead anyway
        resolve();
      };
    });
  };

  const handleTogglePlay = () => {
    if (status === 'playing') {
      stopPlayback(true); // Pause
    } else {
      // Resume or Start
      // Increment ID to ensure we start a fresh loop
      playbackSessionIdRef.current += 1; 
      
      const startIndex = currentChunkIndex > -1 ? currentChunkIndex : 0;
      const startOffset = status === 'paused' ? resumeOffsetRef.current : 0;
      playQueue(startIndex, startOffset);
    }
  };

  const handleParagraphClick = (index: number) => {
    // 1. Stop everything immediately
    stopPlayback(true); 
    
    // 2. Start a fresh session
    playbackSessionIdRef.current += 1;
    
    // 3. Small timeout to allow UI to settle, though ID system handles race conditions
    setTimeout(() => {
        playQueue(index);
    }, 10);
  };

  const handleVoiceChange = (newVoice: string) => {
      stopPlayback(true);
      setSelectedVoice(newVoice);
      setAudioBuffers(new Array(textChunks.length).fill(null));
      processingChunksRef.current.clear();
  };

  const handleModeChange = (nextMode: 'url' | 'text') => {
    setMode(nextMode);
    setError(null);
    stopPlayback(false);
    setAudioBuffers([]);
    setTextChunks([]);
    processingChunksRef.current.clear();
  };

  let playLabel = "Read Aloud";
  if (status === 'paused') playLabel = "Resume";

  // --- Rendering ---

  if (isCheckingKey) {
     return <div className="min-h-screen bg-paper flex items-center justify-center text-ink/60">Loading...</div>;
  }

  // API Key Gate / Landing Page
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-4 py-16 text-ink overflow-hidden">
        {/* Background */}
        <div className="fixed inset-0 pointer-events-none z-0">
           <div className="absolute top-0 left-0 right-0 h-px bg-ink/15"></div>
           <div className="absolute top-0 left-0 h-1 w-24 bg-accent"></div>
           <div className="absolute -top-10 right-10 h-32 w-32 border border-ink/10"></div>
           <div className="absolute bottom-10 left-12 h-24 w-24 border border-ink/10"></div>
        </div>

        <div className="relative z-10 glass-panel max-w-xl w-full rounded-[32px] p-1 shadow-luxe animate-rise">
          <div className="relative bg-white rounded-[28px] p-10 sm:p-12 text-center space-y-8 border border-ink/10">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-paper border border-ink/10 mb-2">
                 <span className="text-[11px] font-semibold text-ink/70 tracking-[0.2em] uppercase">Authentication Required</span>
              </div>
              <h1 className="text-5xl sm:text-6xl font-display font-extrabold tracking-[-0.06em] text-ink text-glow">Lumina</h1>
              <p className="text-ink/60 leading-relaxed text-base sm:text-lg">
                Enter your Google Cloud API key to unlock ultra-realistic AI narration. Your key is stored securely in your browser.
              </p>
            </div>

            {useManualKey ? (
              <form onSubmit={handleManualKeySubmit} className="space-y-4">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste your Gemini API Key here"
                  className="w-full bg-white border border-ink/20 rounded-xl px-5 py-4 text-ink placeholder-ink/40 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all text-sm font-mono shadow-sm"
                  required
                />
                <button 
                  type="submit"
                  disabled={!apiKey.trim()}
                  className="w-full py-4 px-6 bg-accent disabled:bg-ink/30 disabled:text-white/70 text-white font-semibold rounded-xl hover:bg-accent/90 transition-all shadow-glow active:scale-[0.99] flex items-center justify-center gap-2 tracking-tight"
                >
                  Start Listening
                </button>
              </form>
            ) : (
              <button 
                onClick={handleConnectApiKey}
                className="w-full py-4 px-6 bg-accent text-white font-semibold rounded-xl hover:bg-accent/90 transition-all shadow-glow active:scale-[0.99] flex items-center justify-center gap-2 tracking-tight"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.545,10.539h-4.817c-0.347,0.789-0.963,1.405-1.751,1.751v2.859h-1.928v-2.859c-0.789-0.347-1.405-0.963-1.751-1.751H1.539v-1.928h0.759c0.347-0.789,0.963-1.405,1.751-1.751V4.001h1.928v2.859c0.789,0.347,1.405,0.963,1.751,1.751h3.333l1.106-2.211l1.642,1.642l-2.211,1.106h2.298V10.539z M19.461,12.545h-2.298l2.211,1.106l-1.642,1.642l-1.106-2.211h-3.333c-0.347,0.789-0.963,1.405-1.751,1.751v2.859h-1.928v-2.859c-0.789-0.347-1.405-0.963-1.751-1.751H6.002v-1.928h1.862c0.347-0.789,0.963-1.405,1.751-1.751V7.544h1.928v2.859c0.789,0.347,1.405,0.963,1.751,1.751h4.817V12.545z"/></svg>
                Connect API Key
              </button>
            )}
            
            <p className="text-xs text-ink/50">
              Need a key? <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent/80 underline">Get one here</a>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- Main App ---

  return (
    <div className="min-h-screen relative text-ink flex flex-col items-center py-12 px-4 sm:px-6 lg:px-10 pb-36 overflow-hidden selection:bg-accent/20 selection:text-ink">
      
      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        selectedVoice={selectedVoice}
        onVoiceChange={handleVoiceChange}
      />

      {/* Ambient Background Effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
         <div className="absolute top-0 left-0 right-0 h-px bg-ink/10"></div>
         <div className="absolute top-0 left-0 h-1 w-24 bg-accent"></div>
         <div className="absolute right-10 top-16 h-40 w-40 border border-ink/10"></div>
         <div className="absolute left-8 bottom-16 h-28 w-28 border border-ink/10"></div>
      </div>

      <header className="relative z-10 w-full max-w-6xl mb-12 text-center space-y-6 animate-rise">
        <div className="hero-grid" aria-hidden="true"></div>
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-paper border border-ink/15">
            <span className="flex h-2 w-2 rounded-full bg-accent"></span>
            <span className="text-[11px] font-semibold text-ink/70 tracking-[0.2em] uppercase">Powered by Gemini</span>
          </div>
          <div className="flex items-center gap-2 bg-paper border border-ink/15 rounded-full p-1 pl-2">
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 bg-white border border-ink/15 rounded-full hover:bg-paper transition-colors group"
              aria-label="Settings"
            >
              <svg className="w-5 h-5 text-ink/60 group-hover:text-ink transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button 
              onClick={handleLogout}
              className="px-4 py-2 text-[11px] font-semibold tracking-[0.2em] uppercase text-ink/60 border border-ink/15 rounded-full hover:text-ink hover:border-ink/30 transition-colors bg-white"
            >
              Disconnect
            </button>
          </div>
        </div>

        <h1 className="relative z-10 text-6xl sm:text-8xl font-display font-extrabold tracking-[-0.06em] leading-[0.9] text-ink text-glow">
          Lumina
        </h1>
        <p className="relative z-10 text-base sm:text-lg text-ink/60 max-w-2xl mx-auto leading-relaxed">
          Transform the web into your personal audio library with realistic AI narration.
        </p>
      </header>

      <main className="relative z-10 w-full max-w-6xl space-y-10 animate-rise" style={{animationDelay: '0.1s'}}>
        
        {/* Input Card */}
        <div className="glass-panel rounded-[24px] shadow-luxe">
          <div className="bg-paper rounded-[22px] p-6 sm:p-8 lg:p-10 border border-ink/10">
            
            {/* Tabs */}
            <div className="flex items-center gap-6 border-b border-ink/10 mb-6">
              <button 
                onClick={() => handleModeChange('url')}
                className={`pb-3 text-xs font-semibold tracking-[0.2em] transition-all relative ${
                  mode === 'url' 
                    ? 'text-ink' 
                    : 'text-ink/40 hover:text-ink'
                }`}
              >
                Article URL
                {mode === 'url' && <span className="absolute bottom-0 left-0 h-0.5 w-full bg-accent"></span>}
              </button>
              <button 
                onClick={() => handleModeChange('text')}
                className={`pb-3 text-xs font-semibold tracking-[0.2em] transition-all relative ${
                  mode === 'text' 
                    ? 'text-ink' 
                    : 'text-ink/40 hover:text-ink'
                }`}
              >
                Paste Text
                {mode === 'text' && <span className="absolute bottom-0 left-0 h-0.5 w-full bg-accent"></span>}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center">
              {mode === 'url' && (
                <div className="relative flex-1 group">
                  <input
                    type="url"
                    placeholder="https://..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full bg-white border border-ink/20 rounded-xl px-5 py-4 text-ink placeholder-ink/40 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all font-mono text-sm shadow-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleFetchContent()}
                  />
                  <div className="absolute inset-0 rounded-xl bg-accent/10 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500 -z-10"></div>
                </div>
              )}

              {mode === 'text' && (
                <div className="relative flex-1 group">
                  <textarea
                    placeholder="Paste your content..."
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    className="w-full bg-white border border-ink/20 rounded-xl px-5 py-4 text-ink placeholder-ink/40 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all font-sans min-h-[140px] shadow-sm"
                  />
                </div>
              )}

              <button
                onClick={handleFetchContent}
                disabled={isLoadingContent || status === 'playing'}
                className="
                  relative overflow-hidden
                  bg-accent hover:bg-accent/90 
                  disabled:bg-ink/20 disabled:text-white/70 disabled:cursor-not-allowed
                  text-white font-semibold tracking-tight
                  px-8 py-4 rounded-xl 
                  transition-all duration-300
                  shadow-glow hover:shadow-luxe
                  flex items-center justify-center min-w-[140px]
                  group
                "
              >
                <div className="relative z-10 flex items-center gap-2">
                  {isLoadingContent ? (
                    <svg className="animate-spin h-5 w-5 text-white/80" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <>
                      <span>
                        {mode === 'url' && 'Generate'}
                        {mode === 'text' && 'Read'}
                      </span>
                      <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </>
                  )}
                </div>
              </button>
            </div>
            
            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-3 animate-fade-in">
                <div className="bg-red-100 p-1.5 rounded-full">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Article Display */}
        <div className="animate-fade-in" style={{animationDelay: '0.2s'}}>
            <ArticleDisplay 
            chunks={textChunks}
            currentChunkIndex={currentChunkIndex}
            isPlaying={status === 'playing'}
            isPaused={status === 'paused'}
            onChunkClick={handleParagraphClick}
            />
        </div>

      </main>

      {/* Floating Player */}
      {textChunks.length > 0 && (
        <PlayerBar 
          isPlaying={status === 'playing'}
          onTogglePlay={handleTogglePlay}
          speed={speed}
          onSpeedChange={setSpeed}
          disabled={false}
          label={playLabel}
        />
      )}

    </div>
  );
};

export default App;
