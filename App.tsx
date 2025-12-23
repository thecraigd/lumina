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
      try { activeSourceRef.current.playbackRate.value = speed; } catch(e) {}
    }
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

  const playQueue = async (startIndex: number) => {
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
        await playBuffer(buffer, sessionId);

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

  const playBuffer = (buffer: AudioBuffer, sessionId: number): Promise<void> => {
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
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = speedRef.current;
      source.connect(ctx.destination);

      // Ensure we don't schedule in the past
      if (nextStartTimeRef.current < ctx.currentTime) {
        nextStartTimeRef.current = ctx.currentTime;
      }
      
      source.start(nextStartTimeRef.current);
      activeSourceRef.current = source;
      
      const duration = buffer.duration / speedRef.current;
      nextStartTimeRef.current += duration;
      
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
      playQueue(startIndex);
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
     return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading...</div>;
  }

  // API Key Gate / Landing Page
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen relative text-slate-200 flex flex-col items-center justify-center p-4 overflow-hidden">
        {/* Background */}
        <div className="fixed inset-0 pointer-events-none z-0">
           <div className="absolute top-20 left-20 w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob"></div>
           <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob animation-delay-2000"></div>
        </div>

        <div className="relative z-10 glass-panel max-w-lg w-full rounded-2xl p-1 shadow-2xl animate-fade-in">
          <div className="bg-obsidian/60 rounded-xl p-10 text-center space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-2">
                 <span className="text-xs font-semibold text-indigo-300 tracking-wider uppercase">Authentication Required</span>
              </div>
              <h1 className="text-4xl font-bold text-white tracking-tight">Lumina</h1>
              <p className="text-slate-400 leading-relaxed">
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
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-5 py-4 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all text-sm font-mono"
                  required
                />
                <button 
                  type="submit"
                  disabled={!apiKey.trim()}
                  className="w-full py-4 px-6 bg-white disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold rounded-xl hover:bg-slate-200 transition-all shadow-xl shadow-white/10 active:scale-95 flex items-center justify-center gap-2"
                >
                  Start Listening
                </button>
              </form>
            ) : (
              <button 
                onClick={handleConnectApiKey}
                className="w-full py-4 px-6 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-200 transition-all shadow-xl shadow-white/10 active:scale-95 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12.545,10.539h-4.817c-0.347,0.789-0.963,1.405-1.751,1.751v2.859h-1.928v-2.859c-0.789-0.347-1.405-0.963-1.751-1.751H1.539v-1.928h0.759c0.347-0.789,0.963-1.405,1.751-1.751V4.001h1.928v2.859c0.789,0.347,1.405,0.963,1.751,1.751h3.333l1.106-2.211l1.642,1.642l-2.211,1.106h2.298V10.539z M19.461,12.545h-2.298l2.211,1.106l-1.642,1.642l-1.106-2.211h-3.333c-0.347,0.789-0.963,1.405-1.751,1.751v2.859h-1.928v-2.859c-0.789-0.347-1.405-0.963-1.751-1.751H6.002v-1.928h1.862c0.347-0.789,0.963-1.405,1.751-1.751V7.544h1.928v2.859c0.789,0.347,1.405,0.963,1.751,1.751h4.817V12.545z"/></svg>
                Connect API Key
              </button>
            )}
            
            <p className="text-xs text-slate-500">
              Need a key? <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline">Get one here</a>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- Main App ---

  return (
    <div className="min-h-screen relative text-slate-200 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 pb-32 overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-100">
      
      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        selectedVoice={selectedVoice}
        onVoiceChange={handleVoiceChange}
      />

      {/* Logout Button (small) */}
      <button 
        onClick={handleLogout}
        className="absolute top-4 left-4 text-xs font-medium text-slate-600 hover:text-red-400 transition-colors z-50 uppercase tracking-widest"
      >
        Disconnect
      </button>

      {/* Ambient Background Effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
         <div className="absolute top-0 -left-4 w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob"></div>
         <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob animation-delay-2000"></div>
         <div className="absolute -bottom-8 left-20 w-96 h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <header className="relative z-10 w-full max-w-4xl mb-12 text-center space-y-4 animate-fade-in">
        
        {/* Settings Button */}
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="absolute top-0 right-0 p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors group z-50"
          aria-label="Settings"
        >
          <svg className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="text-xs font-medium text-slate-300 tracking-wide uppercase">Powered by Gemini 2.5</span>
        </div>
        <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-indigo-100 to-indigo-400 text-glow">
          Lumina
        </h1>
        <p className="text-lg text-slate-400 max-w-lg mx-auto leading-relaxed">
          Transform the web into your personal audio library with ultra-realistic AI narration.
        </p>
      </header>

      <main className="relative z-10 w-full max-w-4xl space-y-8 animate-fade-in" style={{animationDelay: '0.1s'}}>
        
        {/* Input Card */}
        <div className="glass-panel p-1 rounded-2xl shadow-2xl shadow-indigo-500/10">
          <div className="bg-obsidian/50 rounded-xl p-6 sm:p-8">
            
            {/* Tabs */}
            <div className="flex gap-6 mb-6 border-b border-white/5">
              <button 
                onClick={() => handleModeChange('url')}
                className={`pb-4 text-sm font-semibold tracking-wide transition-all relative ${
                  mode === 'url' 
                    ? 'text-white' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Article URL
                {mode === 'url' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></span>}
              </button>
              <button 
                onClick={() => handleModeChange('text')}
                className={`pb-4 text-sm font-semibold tracking-wide transition-all relative ${
                  mode === 'text' 
                    ? 'text-white' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Paste Text
                {mode === 'text' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></span>}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-stretch">
              {mode === 'url' && (
                <div className="relative flex-1 group">
                  <input
                    type="url"
                    placeholder="https://..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-5 py-4 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all font-mono text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleFetchContent()}
                  />
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500 -z-10 blur-sm"></div>
                </div>
              )}

              {mode === 'text' && (
                <div className="relative flex-1 group">
                  <textarea
                    placeholder="Paste your content..."
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-5 py-4 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all font-serif min-h-[100px]"
                  />
                </div>
              )}

              <button
                onClick={handleFetchContent}
                disabled={isLoadingContent || status === 'playing'}
                className="
                  relative overflow-hidden
                  bg-indigo-600 hover:bg-indigo-500 
                  disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed
                  text-white font-bold tracking-wide
                  px-8 py-4 rounded-xl 
                  transition-all duration-300
                  shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40
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
              <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 text-red-200 rounded-lg text-sm flex items-center gap-3 backdrop-blur-sm animate-fade-in">
                <div className="bg-red-500/20 p-1.5 rounded-full">
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
