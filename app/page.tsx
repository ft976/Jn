'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Zap,
  Film,
  ListVideo,
  Loader2,
  Trash2,
  X,
  ExternalLink,
  History,
  Download,
  AlertCircle,
  CheckCircle2,
  PlayCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Toaster, toast } from 'sonner';
import { default as NextImage } from 'next/image';

type TargetFormat = '1080' | '720' | '480' | '360' | 'mp3' | 'm4a' | 'flac' | 'wav';

interface DownloadTask {
  internalId: string;
  url: string;
  format: string;
  title: string;
  thumbnail: string;
  loaderId?: string;
  status: 'pending' | 'preparing' | 'finished' | 'error';
  progress: number;
  text: string;
  downloadUrl?: string;
}

interface HistoryItem {
  internalId: string;
  url: string;
  format: string;
  title: string;
  thumbnail: string;
  timestamp: number;
}

const VIDEO_FORMATS: TargetFormat[] = ['1080', '720', '480', '360', '4k'] as any;
const AUDIO_FORMATS: TargetFormat[] = ['mp3', 'm4a', 'flac', 'wav'];

export default function App() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'video' | 'playlist'>('video');
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const [playlistInfo, setPlaylistInfo] = useState<any>(null);
  const [previewInfo, setPreviewInfo] = useState<any>(null);
  const [targetFormat, setTargetFormat] = useState<TargetFormat>('1080');
  
  // Load history safely
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bt_history');
      if (saved) {
        try { return JSON.parse(saved); } catch (e) {}
      }
    }
    return [];
  });
  
  const [activeTasks, setActiveTasks] = useState<DownloadTask[]>([]);
  const activeTasksRef = useRef<DownloadTask[]>([]);
  
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const updateTask = (id: string, updates: Partial<DownloadTask>) => {
    setActiveTasks(prev => prev.map(t => t.internalId === id ? { ...t, ...updates } : t));
  };

  // Sync ref for interval polling
  useEffect(() => {
    activeTasksRef.current = activeTasks;
  }, [activeTasks]);

  // Save history
  useEffect(() => {
    localStorage.setItem('bt_history', JSON.stringify(history));
  }, [history]);

  // Lock body scroll when sidebar open using safer padding right approach
  useEffect(() => {
    if (historyOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  }, [historyOpen]);

  // Background polling for downloads
  useEffect(() => {
    let isFetching = false;
    const interval = setInterval(async () => {
      if (isFetching) return;
      const pollingTasks = activeTasksRef.current.filter(t => t.status === 'preparing' && t.loaderId);
      if (pollingTasks.length === 0) return;

      isFetching = true;
      
      await Promise.allSettled(pollingTasks.map(async (task) => {
        try {
          const res = await fetch(`/api/loader/progress?id=${task.loaderId}`);
          
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || errData.details || `Server returned HTTP ${res.status}`);
          }
          
          const data = await res.json();
          
          if (data.success === 1 || data.download_url) {
            updateTask(task.internalId, {
              status: 'finished',
              progress: 100,
              text: 'Ready to save',
              downloadUrl: data.download_url
            });
            toast.success('Download Ready!', { description: task.title });
          } else if (data.success === true || data.success === 0 || data.progress !== undefined) {
            // loader.to specific edge case
            if (data.success === 0 && data.text) {
               const lowText = data.text.toLowerCase();
               if (lowText.includes('error') || lowText.includes('not available') || lowText.includes('failed')) {
                  throw new Error(data.text);
               }
            }

            let parsedProgress = parseFloat(data.progress);
            if (!isNaN(parsedProgress)) {
              parsedProgress = parsedProgress / 10;
              if (parsedProgress > 100) parsedProgress = 100;
              if (parsedProgress < 0) parsedProgress = 0;
            } else {
              parsedProgress = task.progress;
            }

            updateTask(task.internalId, {
              progress: parsedProgress,
              text: data.text || task.text
            });
          }
        } catch (e: any) {
          console.error(`[Polling Error] Task ${task.internalId} (${task.title}):`, e);
          let userMsg = e.message || 'Connection lost.';
          
          if (userMsg.includes('fetch')) userMsg = 'Proxy timeout. Retrying...';
          if (userMsg.includes('Unexpected token')) userMsg = 'Upstream API instability.';
          
          updateTask(task.internalId, {
            status: 'error',
            text: userMsg
          });
          toast.error('Download Interrupted', { description: userMsg });
        }
      }));
      
      isFetching = false;
    }, 1000); // 1s interval is safe because execution is fully parallel
    
    return () => clearInterval(interval);
  }, []);

  const handleBlurURL = async () => {
    if (!url || mode === 'playlist') return null;
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (res.ok) {
        const data = await res.json();
        setPreviewInfo(data);
        return data;
      } else {
        setPreviewInfo(null);
        return null;
      }
    } catch {
      return null;
    }
  };

  const analyze = async () => {
    if (!url) return;
    setIsAnalyzing(true);
    setVideoInfo(null);
    setPlaylistInfo(null);
    setPreviewInfo(null);

    // Provide a small loading toast hint so the user knows deep analysis takes a sec
    const loadToastId = toast.loading('Running deep connection analysis...');

    if (mode === 'playlist') {
      try {
        const res = await fetch(`/api/playlist?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        if (data && data.entries) {
          setPlaylistInfo(data);
          toast.success('Playlist Parsed', { id: loadToastId });
        } else {
          toast.error('Failed to parse playlist.', { description: data.error, id: loadToastId });
        }
      } catch (err: any) {
        toast.error('Network error', { description: 'Failed to connect to playlist parser.', id: loadToastId });
      }
    } else {
      let activePreview = previewInfo;
      if (!activePreview) {
        activePreview = await handleBlurURL();
      }
      
      if (activePreview) {
         // Deep analysis strictly blocks to fetch actual available quality formats, captions, etc.
         try {
           const res = await fetch(`/api/video?url=${encodeURIComponent(url)}`);
           if (res.ok) {
             const deepData = await res.json();
             setVideoInfo({ ...activePreview, ...deepData });
             
             // Auto-select highest available format instead of hardcoded 1080p
             if (deepData.availableFormats && deepData.availableFormats.length > 0) {
               const mapOrder: any = { '4k': 4000, '1080': 1080, '720': 720, '480': 480, '360': 360 };
               const bestFormat = [...deepData.availableFormats].sort((a,b) => mapOrder[b] - mapOrder[a])[0];
               if (bestFormat) setTargetFormat(bestFormat as TargetFormat);
             }

             toast.success('Analysis Complete', { id: loadToastId });
           } else {
             const errData = await res.json().catch(() => ({}));
             setVideoInfo(activePreview);
             toast.error(errData.error || 'Analysis failed', { description: 'Deep scan bypassed.', id: loadToastId });
           }
         } catch (e) {
           setVideoInfo(activePreview);
           console.error('Deep analysis failed', e);
           toast.error('Analysis error', { description: 'Network failed during deep scan.', id: loadToastId });
         }
      } else {
         toast.error('Video Not Found', { description: 'Could not fetch metadata for this URL.', id: loadToastId });
      }
    }
    
    setIsAnalyzing(false);
  };

  const executeDownload = async (vidUrl: string, title: string, thumbnail: string) => {
    const internalId = Math.random().toString(36).substring(7);
    const newTask: DownloadTask = { 
      internalId, 
      url: vidUrl, 
      format: targetFormat, 
      title: title || 'YouTube Video', 
      thumbnail: thumbnail || '', 
      status: 'pending', 
      progress: 0, 
      text: 'Requesting secure bypass...' 
    };

    setActiveTasks(prev => [...prev, newTask]);
    setHistory(prev => [{
      internalId,
      url: vidUrl,
      format: targetFormat,
      title: newTask.title,
      thumbnail: newTask.thumbnail,
      timestamp: Date.now()
    }, ...prev].slice(0, 50));
    setHistoryOpen(true);
    toast.success('Added to download queue', { description: `Target Format: ${targetFormat.toUpperCase()}` });

    try {
      console.log(`[Frontend] Queuing download: ${vidUrl} [${targetFormat}]`);
      const res = await fetch(`/api/loader/download?url=${encodeURIComponent(vidUrl)}&format=${targetFormat}`);
      
      if (!res.ok) {
         const errData = await res.json().catch(() => ({}));
         throw new Error(errData.error || errData.details || `Server returned HTTP ${res.status}`);
      }
      
      const data = await res.json();
      if (data.id) {
        updateTask(internalId, { loaderId: data.id, status: 'preparing', text: 'Connecting to proxy...' });
      } else {
        const errorMsg = data.error || data.text || 'Backend bypass failed - upsteam rejected the job.';
        console.error(`[Frontend] Task creation failed logically:`, data);
        updateTask(internalId, { status: 'error', text: errorMsg });
        toast.error('Bypass failed', { description: errorMsg });
      }
    } catch (err: any) {
      console.error(`[Frontend] Task creation network/server error:`, err);
      updateTask(internalId, { status: 'error', text: err.message || 'Network connection failed' });
      toast.error('Network Error', { description: err.message || 'Failed to connect to the proxy.' });
    }
  };

  const queuePlaylistAll = () => {
    if (!playlistInfo?.entries) return;
    const entries = playlistInfo.entries.filter((e: any) => e.url || e.id);
    if (entries.length === 0) return;
    
    toast.success(`Queueing ${entries.length} videos...`, { description: 'Processing in high-speed parallel batches.' });

    let i = 0;
    const BATCH_SIZE = 4; // Fetch 4 parallel items at a time
    
    const interval = setInterval(() => {
      if (i >= entries.length) {
        clearInterval(interval);
        return;
      }
      
      const batch = entries.slice(i, i + BATCH_SIZE);
      batch.forEach((item: any) => {
        const vidUrl = item.url || `https://www.youtube.com/watch?v=${item.id}`;
        const thumb = item.thumbnails?.length ? item.thumbnails[item.thumbnails.length - 1].url : '';
        executeDownload(vidUrl, item.title, thumb);
      });
      
      i += BATCH_SIZE;
    }, 1000);
  };

  const triggerSave = (downloadUrl: string, title?: string) => {
    try {
      // Create a native anchor element for the highest compatibility with mobile OS file managers
      const a = document.createElement('a');
      a.href = downloadUrl;
      
      // Clean title for safe filesystem saving
      const safeTitle = title ? title.replace(/[^a-zA-Z0-9\u00C0-\u017F -]/g, '').trim() : 'BypassTube_Download';
      
      // We sniff the targetFormat from the queue UI, but for native clicks, 
      // the backend proxy usually handles the extension headers. 
      // We set a fallback download attribute to nudge the OS file picker.
      a.download = `${safeTitle}`;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      toast.success('Download Initiated', { description: 'Saving directly to your device storage.' });
    } catch (e) {
      // Ultimate fallback for very strict mobile browsers
      window.open(downloadUrl, '_blank');
      toast.success('Download Initiated', { description: 'Opening secure download stream.' });
    }
  };

  return (
    <div className="min-h-[100dvh] bg-neutral-950 text-neutral-200 font-sans flex flex-col selection:bg-red-600/30 selection:text-red-100 overflow-x-hidden">
      <Toaster theme="dark" position="bottom-right" richColors toastOptions={{ style: { background: '#0a0a0a', border: '1px solid #262626' } }} />
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-40 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-900">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-1.5 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white fill-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-none mb-0.5">BypassTube</h1>
              <p className="text-[10px] text-red-500 font-semibold tracking-widest uppercase leading-none">Pro Downloader</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-sm font-medium px-4 py-2 rounded-lg transition-colors group relative"
          >
            <History className="w-4 h-4 text-neutral-400 group-hover:text-white transition-colors" />
            <span className="hidden sm:inline">Active & History</span>
            {activeTasks.length > 0 && (
               <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-4 w-4 bg-red-600 items-center justify-center text-[9px] font-bold text-white">
                    {activeTasks.filter(t => t.status !== 'finished').length}
                 </span>
               </span>
            )}
          </button>
        </div>
      </div>
    </nav>

        {/* Main Content */}
      <main className="flex-1 w-full flex flex-col pt-24 pb-20">
        
        {/* Fixed Hero / Search Section to prevent jumping */}
        <div className="w-full max-w-5xl mx-auto px-4 md:px-6 flex flex-col items-center shrink-0">
          
          {/* Toggle Mode */}
          <div className="bg-neutral-900 p-1 rounded-xl flex gap-1 mb-8 border border-neutral-800/80 shadow-2xl">
            <button
              onClick={() => { setMode('video'); setVideoInfo(null); setPlaylistInfo(null); }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${mode === 'video' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
            >
              <Film className="w-4 h-4" /> Single Video
            </button>
            <button
              onClick={() => { setMode('playlist'); setVideoInfo(null); setPlaylistInfo(null); setPreviewInfo(null); }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${mode === 'playlist' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-400 hover:text-neutral-200'}`}
            >
              <ListVideo className="w-4 h-4" /> Full Playlist
            </button>
          </div>

          {/* Input Card */}
          <div className="w-full max-w-3xl bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 sm:p-6 shadow-2xl relative overflow-hidden backdrop-blur-sm transition-all duration-500">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 via-red-500 to-red-600"></div>
             
             <div className="flex flex-col sm:flex-row gap-3">
               <div className="relative flex-1">
                 <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                   <Search className="w-5 h-5 text-neutral-500" />
                 </div>
                 <input 
                   type="text" 
                   value={url}
                   onChange={e => setUrl(e.target.value)}
                   onBlur={handleBlurURL}
                   onKeyDown={e => e.key === 'Enter' && analyze()}
                   placeholder={`Paste YouTube ${mode === 'video' ? 'Video' : 'Playlist'} URL here...`}
                   className="w-full bg-neutral-950 border border-neutral-800 text-white placeholder-neutral-500 rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent transition-all shadow-inner"
                 />
               </div>
               <button
                 onClick={analyze}
                 disabled={!url || isAnalyzing}
                 className="bg-red-600 hover:bg-red-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold px-8 py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
               >
                 {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 fill-current" />}
                 Analyze
               </button>
             </div>
             
             {/* Quick Preview (oEmbed) */}
             <AnimatePresence>
             {mode === 'video' && previewInfo && !videoInfo && !isAnalyzing && (
               <motion.div initial={{opacity:0, height: 0, marginTop: 0}} animate={{opacity:1, height:'auto', marginTop: 16}} exit={{opacity:0, height: 0, marginTop: 0}} className="flex items-center gap-3 p-3 bg-neutral-950/50 rounded-lg border border-neutral-800/50 overflow-hidden">
                 <div className="w-16 h-9 rounded shadow ring-1 ring-white/10 bg-cover bg-center shrink-0" style={{ backgroundImage: `url(${previewInfo.thumbnail_url})`}} />
                 <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{previewInfo.title}</p>
                    <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Verified Source
                    </p>
                 </div>
               </motion.div>
             )}
             </AnimatePresence>
          </div>
        </div>

        <div className="w-full max-w-5xl mx-auto px-4 md:px-6 flex flex-col items-center relative z-10 flex-1">
          {/* Format Selection (Appears if analysis shows results) */}
        {(videoInfo || playlistInfo) && (
          <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} className="w-full max-w-3xl mt-8">
            <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest mb-4 text-center">Select Target Format</h3>
            <div className="flex flex-col sm:flex-row gap-4 bg-neutral-900/30 p-2 rounded-2xl border border-neutral-800/50">
              <div className="flex-1 flex flex-wrap gap-2">
                {(videoInfo?.availableFormats || VIDEO_FORMATS).map((fmt: any) => (
                  <button 
                    key={fmt} 
                    onClick={() => setTargetFormat(fmt)}
                    className={`flex-1 min-w-[60px] py-3 text-sm font-bold rounded-xl transition-all ${targetFormat === fmt ? 'bg-red-600 text-white shadow-lg' : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:border-neutral-600 hover:text-white'}`}
                  >
                    {fmt}{fmt === '4k' ? '' : 'p'}
                  </button>
                ))}
              </div>
              <div className="w-px bg-neutral-800 hidden sm:block"></div>
              <div className="flex-1 flex flex-wrap gap-2">
                {AUDIO_FORMATS.map(fmt => (
                  <button 
                    key={fmt} 
                    onClick={() => setTargetFormat(fmt)}
                    className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${targetFormat === fmt ? 'bg-indigo-600 text-white shadow-lg' : 'bg-neutral-900 text-neutral-400 border border-neutral-800 hover:border-neutral-600 hover:text-white'}`}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Video Mode UI */}
        {videoInfo && !isAnalyzing && (
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="w-full max-w-4xl mt-8 bg-neutral-900 rounded-3xl border border-neutral-800 overflow-hidden shadow-2xl flex flex-col md:flex-row">
             <div className="w-full md:w-1/2 relative bg-neutral-950 aspect-video md:aspect-auto bg-cover bg-center shrink-0" style={{ backgroundImage: `url(${videoInfo.thumbnail_url || videoInfo.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&q=80&w=1000'})` }}>
                <div className="absolute inset-0 bg-black/40 mix-blend-multiply"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <PlayCircle className="w-16 h-16 text-white/50" />
                </div>
                {/* Fallback duration badge since oEmbed might not have it, but standard YT DL does */}
                {videoInfo.duration && (
                  <div className="absolute bottom-4 right-4 bg-black/80 px-2 py-1 rounded text-xs font-mono font-bold text-white shadow backdrop-blur items-center gap-1 flex">
                    {Math.floor(videoInfo.duration / 60)}:{(videoInfo.duration % 60).toString().padStart(2, '0')}
                  </div>
                )}
             </div>
             <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col justify-between">
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-white leading-snug mb-3 line-clamp-3">{videoInfo.title}</h2>
                  <p className="text-sm text-neutral-400 flex items-center gap-2 mb-4">
                     <span className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-300">
                        {videoInfo.author_name?.[0] || 'A'}
                     </span>
                     {videoInfo.author_name || 'Anonymous Author'}
                  </p>
                  
                  {/* Rich Deep Scan Metadata */}
                  {(videoInfo.fps || videoInfo.hasCaptions || videoInfo.views) && (
                    <div className="flex flex-wrap gap-2">
                       {videoInfo.fps && (
                         <span className="px-2.5 py-1 rounded bg-neutral-800 text-[10px] font-bold tracking-wider text-neutral-300 uppercase border border-neutral-700">
                           {videoInfo.fps} FPS
                         </span>
                       )}
                       {videoInfo.hasCaptions && (
                         <span className="px-2.5 py-1 rounded bg-indigo-900/40 text-[10px] font-bold tracking-wider text-indigo-300 uppercase border border-indigo-700/50">
                           CC Captions
                         </span>
                       )}
                       {videoInfo.views && (
                         <span className="px-2.5 py-1 rounded bg-neutral-800 text-[10px] font-bold tracking-wider text-neutral-300 uppercase border border-neutral-700">
                           {(videoInfo.views).toLocaleString()} Views
                         </span>
                       )}
                    </div>
                  )}
                </div>
                <div className="mt-8 pt-6 border-t border-neutral-800 bg-neutral-950/30 -mx-6 -mb-6 p-6">
                  <button 
                    onClick={() => executeDownload(url, videoInfo.title, videoInfo.thumbnail_url)}
                    className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl flex justify-center items-center gap-3 transition-colors shadow-lg shadow-red-900/30"
                  >
                    <Download className="w-5 h-5" /> Queue Download ({targetFormat})
                  </button>
                </div>
             </div>
          </motion.div>
        )}

        {/* Playlist Mode UI */}
        {playlistInfo && !isAnalyzing && (
          <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="w-full max-w-4xl mt-8">
             <div className="bg-neutral-900 rounded-3xl border border-neutral-800 overflow-hidden shadow-2xl p-6 md:p-8 mb-6 flex flex-col md:flex-row gap-6 relative">
               <div className="w-full md:w-32 aspect-video md:aspect-square bg-neutral-950 rounded-xl overflow-hidden shadow-inner flex-shrink-0 bg-cover bg-center" style={{ backgroundImage: `url(${playlistInfo.entries?.[0]?.thumbnails?.[0]?.url || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&q=80&w=200'})` }} />
               <div className="flex-1 flex flex-col justify-center">
                  <h2 className="text-xl md:text-2xl font-bold text-white mb-2">{playlistInfo.title || 'Playlist'}</h2>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-400">
                     <span>{playlistInfo.uploader}</span>
                     <span className="w-1 h-1 rounded-full bg-neutral-700"></span>
                     <span className="font-medium text-white bg-neutral-800 px-2 py-0.5 rounded">{playlistInfo.entries?.length || 0} Videos</span>
                  </div>
               </div>
               <div className="flex items-center">
                  <button 
                    onClick={queuePlaylistAll}
                    className="w-full md:w-auto bg-neutral-100 hover:bg-white text-neutral-950 font-bold px-6 py-4 rounded-xl flex justify-center items-center gap-2 transition-colors shadow-lg"
                  >
                    <Download className="w-5 h-5" /> Download All
                  </button>
               </div>
             </div>

             <div className="space-y-3">
               {playlistInfo.entries?.map((item: any, idx: number) => {
                 if (!item.title || !item.id) return null;
                 const thumb = item.thumbnails?.length ? item.thumbnails[item.thumbnails.length - 1].url : '';
                 const itemUrl = item.url || `https://www.youtube.com/watch?v=${item.id}`;
                 return (
                   <motion.div layout key={item.id + idx} className="bg-neutral-900/50 border border-neutral-800/80 p-3 rounded-xl flex items-center gap-4 hover:bg-neutral-900 transition-colors">
                      <div className="text-neutral-500 font-mono text-sm font-bold w-6 text-center">{idx + 1}</div>
                      <div className="w-20 aspect-video bg-neutral-950 bg-cover bg-center rounded md overflow-hidden relative border border-neutral-800 shadow flex-shrink-0" style={{ backgroundImage: thumb ? `url(${thumb})` : 'none' }}>
                         {item.duration && (
                           <div className="absolute bottom-1 right-1 bg-black/90 px-1 py-0.5 rounded text-[9px] font-mono font-bold text-white leading-none">
                             {Math.floor(item.duration / 60)}:{(item.duration % 60).toString().padStart(2, '0')}
                           </div>
                         )}
                      </div>
                      <div className="flex-1 min-w-0">
                         <h4 className="text-sm font-semibold text-neutral-200 truncate pr-4">{item.title}</h4>
                      </div>
                      <button 
                         onClick={() => executeDownload(itemUrl, item.title, thumb)}
                         className="bg-neutral-800 hover:bg-red-600 hover:text-white text-neutral-400 p-2 rounded-lg transition-all border border-neutral-700 hover:border-red-500 shadow-sm flex-shrink-0"
                         title="Download Single"
                      >
                         <Download className="w-4 h-4" />
                      </button>
                   </motion.div>
                 );
               })}
             </div>
          </motion.div>
        )}
        </div>
      </main>

      {/* Downloads Sidebar */}
      <AnimatePresence>
        {historyOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div 
              initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} 
              onClick={() => setHistoryOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{x: '100%'}} animate={{x: 0}} exit={{x: '100%'}} transition={{type: 'spring', damping: 25, stiffness: 200}}
              className="relative w-full max-w-md h-full bg-neutral-900 border-l border-neutral-800 flex flex-col shadow-2xl"
            >
               <div className="p-4 md:p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/50">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <History className="w-5 h-5 text-red-500" /> Queue & History
                  </h2>
                  <button onClick={() => setHistoryOpen(false)} className="text-neutral-400 hover:text-white p-2 bg-neutral-900 rounded-lg border border-neutral-800 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
               </div>

               <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-8">
                 
                 {/* Active Queue */}
                 <section>
                   <div className="flex items-center justify-between mb-4">
                     <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Active Downloads ({activeTasks.length})</h3>
                     {activeTasks.some(t => t.status === 'finished' || t.status === 'error') && (
                       <button onClick={() => setActiveTasks(prev => prev.filter(t => t.status !== 'finished' && t.status !== 'error'))} className="text-[10px] text-neutral-500 hover:text-red-400 uppercase font-semibold">Clear Done</button>
                     )}
                   </div>
                   {activeTasks.length === 0 ? (
                     <div className="flex flex-col items-center justify-center p-8 text-neutral-500 border border-dashed border-neutral-800 rounded-2xl bg-neutral-950/30">
                        <CheckCircle2 className="w-8 h-8 mb-2 opacity-50" />
                        <p className="text-sm">No active tasks</p>
                     </div>
                   ) : (
                     <div className="flex flex-col gap-3">
                       <AnimatePresence>
                       {activeTasks.map(task => (
                         <motion.div layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} key={task.internalId} className="bg-neutral-950 border border-neutral-800 p-4 rounded-xl shadow-lg relative overflow-hidden group">
                            {/* Format Badge */}
                            <div className="absolute top-3 right-3 text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 uppercase border border-neutral-700">
                              {task.format}
                            </div>
                            
                            <h4 className="text-sm font-semibold text-white mb-3 pr-12 line-clamp-1">{task.title}</h4>
                            
                            {task.status !== 'finished' && task.status !== 'error' ? (
                              <div>
                                <div className="flex justify-between items-center text-xs mb-1.5">
                                   <span className="text-neutral-400 truncate pr-4">{task.text}</span>
                                   <span className="font-mono text-red-500 font-bold tabular-nums">{(task.progress || 0).toFixed(1)}%</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="h-1.5 flex-1 bg-neutral-900 rounded-full overflow-hidden">
                                    <motion.div 
                                      className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full" 
                                      initial={{ width: "0%" }} 
                                      animate={{ width: `${task.progress || 0}%` }} 
                                      transition={{ type: "spring", bounce: 0, stiffness: 60, damping: 15 }} 
                                    />
                                  </div>
                                  <button
                                    onClick={() => {
                                      setActiveTasks(prev => prev.filter(t => t.internalId !== task.internalId));
                                      toast.info('Download Cancelled', { description: task.title });
                                    }}
                                    className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 hover:text-red-400 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : task.status === 'finished' ? (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-emerald-500 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Ready
                                  </span>
                                  <button 
                                    onClick={() => triggerSave(task.downloadUrl!, task.title)}
                                    className="text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                                  >
                                    <Download className="w-3 h-3" /> Save File
                                  </button>
                                </div>
                                <p className="text-[9px] text-neutral-500 font-medium">Click Save File to securely download to your phone. The item will not be deleted until you click the trash icon.</p>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-red-500 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" /> {task.text}
                                </span>
                              </div>
                            )}

                            {/* Remove button overlay for finished/error tasks */}
                            {(task.status === 'finished' || task.status === 'error') && (
                              <button 
                                onClick={() => setActiveTasks(prev => prev.filter(t => t.internalId !== task.internalId))}
                                className="absolute bottom-3 right-3 p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:bg-red-500/20 hover:border-red-500/30 opacity-0 group-hover:opacity-100 transition-all origin-right"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                         </motion.div>
                       ))}
                       </AnimatePresence>
                     </div>
                   )}
                 </section>

                 <div className="w-full h-px bg-neutral-800"></div>

                 {/* History */}
                 <section>
                   <div className="flex items-center justify-between mb-4">
                     <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Past Downloads</h3>
                     {history.length > 0 && (
                       <button onClick={() => setHistory([])} className="text-[10px] text-neutral-500 hover:text-red-400 uppercase font-semibold">Clear</button>
                     )}
                   </div>
                   
                   <div className="flex flex-col gap-2">
                     <AnimatePresence>
                     {history.map((item, idx) => {
                       const isEnqueued = activeTasks.some(t => t.url === item.url && t.format === item.format);
                       
                       return (
                       <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} key={item.internalId + idx} className="flex gap-3 p-3 bg-neutral-950/30 border border-neutral-800/50 rounded-xl hover:bg-neutral-900 hover:border-neutral-700 transition-colors group">
                          <div className="w-16 aspect-video bg-neutral-950 bg-cover bg-center rounded overflow-hidden flex-shrink-0 relative border border-neutral-800" style={{ backgroundImage: item.thumbnail ? `url(${item.thumbnail})` : 'none' }}>
                             <div className="absolute inset-0 bg-black/40"></div>
                             <div className="absolute bottom-1 right-1 text-[8px] font-bold text-white bg-black/80 px-1 rounded uppercase tracking-wider">{item.format}</div>
                          </div>
                          <div className="flex-1 min-w-0 py-0.5 flex flex-col justify-between">
                             <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-neutral-300 truncate hover:text-white hover:underline flex items-center gap-1 group/link">
                               {item.title} <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                             </a>
                             <div className="flex items-center justify-between mt-1">
                                <span className="text-[10px] text-neutral-500 font-mono">
                                  {formatDistanceToNow(item.timestamp)} ago
                                </span>
                                {isEnqueued ? (
                                  <span className="text-[10px] font-bold text-red-500 animate-pulse tracking-wide uppercase">Processing...</span>
                                ) : (
                                  <button
                                    onClick={() => executeDownload(item.url, item.title, item.thumbnail)}
                                    className="text-[10px] font-bold text-neutral-400 hover:text-white bg-neutral-800 px-2 py-1 rounded transition-colors hidden group-hover:block"
                                  >
                                    Re-trigger
                                  </button>
                                )}
                             </div>
                          </div>
                       </motion.div>
                     )})}
                     </AnimatePresence>
                     {history.length === 0 && (
                       <p className="text-xs text-neutral-500 text-center py-6">Your download history will appear here.</p>
                     )}
                   </div>
                 </section>

               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
