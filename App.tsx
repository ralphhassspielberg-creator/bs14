
import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { 
    generateRevisedImage, 
    generateRejuvenatedPrompt, 
    createCharacterBible,
    analyzeSceneImage,
    identifyConsistentCharacter
} from './services/geminiService';

type SourceImage = { fileName: string; base64: string; mimeType: string };
type TextFile = { name: string; content: string };
type RejuvenatedItem = { originalName: string; newName: string; base64: string; prompt: string };

const App: React.FC = () => {
    // Stage Management
    const [stage, setStage] = useState<'IDLE' | 'ANALYZING' | 'PROCESSING' | 'COMPLETE'>('IDLE');
    const [isUploading, setIsUploading] = useState(false);
    const [status, setStatus] = useState('SYSTEM_READY');
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Data Storage
    const [avatars, setAvatars] = useState<Record<string, SourceImage>>({});
    const [processedImages, setProcessedImages] = useState<Record<string, SourceImage>>({});
    const [textFiles, setTextFiles] = useState<TextFile[]>([]);
    const [fullScript, setFullScript] = useState<TextFile | null>(null);
    const [storyMap, setStoryMap] = useState<TextFile | null>(null);
    const [style, setStyle] = useState("cinematic film grain, high-key lighting, vibrant reds and deep blacks.");
    
    // Mapping & Bible
    const [characterBible, setCharacterBible] = useState<string>('');
    const [results, setResults] = useState<RejuvenatedItem[]>([]);
    
    const consoleScrollRef = useRef<HTMLDivElement>(null);

    const addLog = (msg: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, `[${timestamp}] ${msg}`]);
    };

    useEffect(() => {
        if (consoleScrollRef.current) {
            consoleScrollRef.current.scrollTop = consoleScrollRef.current.scrollHeight;
        }
    }, [logs]);

    const downloadFile = (data: string | Blob, filename: string, isBase64 = false) => {
        const a = document.createElement('a');
        if (typeof data === 'string' && isBase64) {
            a.href = `data:image/png;base64,${data}`;
        } else if (data instanceof Blob) {
            a.href = URL.createObjectURL(data);
        } else {
            const blob = new Blob([data], { type: 'text/plain' });
            a.href = URL.createObjectURL(blob);
        }
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (typeof data === 'string' && isBase64) {
            // No URL to revoke for data strings
        } else if (a.href) {
            URL.revokeObjectURL(a.href);
        }
    };

    const recursiveUnzip = async (zipData: ArrayBuffer | Blob): Promise<{ images: Record<string, SourceImage>, texts: TextFile[] }> => {
        const zip = await JSZip.loadAsync(zipData);
        let extractedImages: Record<string, SourceImage> = {};
        let extractedTexts: TextFile[] = [];

        const entries = Object.keys(zip.files);
        for (const name of entries) {
            const entry = zip.files[name];
            if (entry.dir) continue;

            const ext = name.toLowerCase().split('.').pop() || '';
            if (ext === 'zip') {
                const subZipData = await entry.async('arraybuffer');
                const subResults = await recursiveUnzip(subZipData);
                extractedImages = { ...extractedImages, ...subResults.images };
                extractedTexts = [...extractedTexts, ...subResults.texts];
            } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
                const base64 = await entry.async('base64');
                const mime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                extractedImages[name] = { fileName: name, base64, mimeType: mime };
            } else if (['txt', 'md'].includes(ext)) {
                const content = await entry.async('string');
                extractedTexts.push({ name: name, content });
            }
        }
        return { images: extractedImages, texts: extractedTexts };
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        setIsUploading(true);
        setError(null);
        setStage('ANALYZING'); // Immediately move to analyzing stage
        addLog("DECODING ARCHIVES...");

        try {
            let tempAvatars: Record<string, SourceImage> = {};
            let tempProcessed: Record<string, SourceImage> = {};
            let tempTexts: TextFile[] = [];

            for (const file of Array.from(files) as File[]) {
                const name = file.name.toLowerCase();
                const data = await file.arrayBuffer();
                const extracted = await recursiveUnzip(data);

                if (name.includes('avatars')) {
                    tempAvatars = { ...tempAvatars, ...extracted.images };
                } else if (name.includes('processed')) {
                    tempProcessed = { ...tempProcessed, ...extracted.images };
                    tempTexts = [...tempTexts, ...extracted.texts];
                }
            }
            
            // Generate hs4000.txt from individual scene files
            const sortedImageKeys = Object.keys(tempProcessed).sort();
            const hs4000Lines: string[] = [];
            for (const imageKey of sortedImageKeys) {
                const base = imageKey.split('.').shift() || "";
                const tFile = tempTexts.find(t => t.name.startsWith(base) && t.name.endsWith('.txt'));
                if (tFile) {
                    const lines = tFile.content.split('\n');
                    if (lines.length >= 4) {
                        hs4000Lines.push(lines[3]);
                    }
                }
            }
            const hs4000Content = hs4000Lines.join('\n');
            
            // Download hs4000.txt FIRST
            downloadFile(hs4000Content, 'hs4000.txt');
            addLog("DOWNLOADED: hs4000.txt");

            const story = tempTexts.find(t => t.name.toLowerCase() === 'story.txt');
            const globalStyle = tempTexts.find(t => t.name.toLowerCase() === 'style.txt');
            
            if (globalStyle) setStyle(globalStyle.content);
            if (story) setStoryMap(story);

            setAvatars(tempAvatars);
            setProcessedImages(tempProcessed);
            setTextFiles(tempTexts);
            // Set the *newly generated* content as the full script
            setFullScript({ name: 'hs4000.txt', content: hs4000Content });

            addLog(`LOADED: ${Object.keys(tempProcessed).length} FRAMES, ${Object.keys(tempAvatars).length} AVATARS.`);
        } catch (err) {
            setError("ARCHIVE READ ERROR.");
            addLog(`CRITICAL: ${err}`);
            setStage('IDLE');
        } finally {
            setIsUploading(false);
        }
    };
    
    const runAnalysis = async () => {
        if (!fullScript || fullScript.content.trim() === '') {
             setError("GENERATED SCRIPT IS EMPTY. CANNOT CREATE BIBLE. PROCESS HALTED.");
             setStage('IDLE');
             return;
        }
        addLog("GENERATING CHARACTER BIBLE FROM GENERATED SCRIPT...");
        setStatus("BUILDING BIBLE...");
        const bible = await createCharacterBible(Object.keys(avatars), fullScript.content);
        
        downloadFile(bible, 'bible.txt');
        addLog("DOWNLOADED: bible.txt");

        setCharacterBible(bible);
        addLog("BIBLE READY. PROCEEDING TO FULL PRODUCTION.");
        setStage('PROCESSING');
    };

    const processProductionRun = async () => {
        addLog("LAUNCHING FULL PRODUCTION SEQUENCE...");
        
        // FIX: Cast Object.values to SourceImage[] to fix downstream type errors.
        const allImages = (Object.values(processedImages) as SourceImage[]).sort((a, b) => a.fileName.localeCompare(b.fileName));
        
        if (allImages.length === 0) {
            addLog("NO IMAGES TO PROCESS. PRODUCTION COMPLETE.");
            setStage('COMPLETE');
            return;
        }

        for (let i = 0; i < allImages.length; i++) {
            const img = allImages[i];
            const base = img.fileName.split('.').shift() || "";
            const tFile = textFiles.find(t => t.name.startsWith(base) && t.name.endsWith('.txt'));
            
            if (!tFile) {
                addLog(`SKIPPING: ${img.fileName} (NO CONTEXT)`);
                continue;
            }

            const sceneTextSnippet = tFile.content.split('\n').slice(3).join('\n');
            
            let scriptContext = "";
            if (fullScript) {
                const snippetStart = sceneTextSnippet.substring(0, 40);
                const index = fullScript.content.indexOf(snippetStart);
                if (index !== -1) {
                    scriptContext = fullScript.content.substring(Math.max(0, index - 1000), Math.min(fullScript.content.length, index + 3000));
                }
            }

            setStatus(`PROCESS: [${i + 1}/${allImages.length}] - ${img.fileName}`);
            
            try {
                const visualAnalysis = await analyzeSceneImage(img.base64, img.mimeType);
                const mapping = await identifyConsistentCharacter(sceneTextSnippet, visualAnalysis, characterBible);
                const avatar = mapping.avatarFilename ? avatars[mapping.avatarFilename] : null;

                const prompt = await generateRejuvenatedPrompt(
                    sceneTextSnippet, 
                    mapping.characterName, 
                    mapping.otherCharacters || [],
                    characterBible, 
                    style, 
                    visualAnalysis,
                    scriptContext,
                    storyMap?.content || null
                );
                
                const gen = await generateRevisedImage(prompt, avatar?.base64 || null, avatar?.mimeType || null, img.base64, img.mimeType);

                if (gen.imageBase64) {
                    const result = {
                        originalName: img.fileName,
                        newName: `${base}_rejuvenated.png`,
                        base64: gen.imageBase64,
                        prompt
                    };
                    
                    const metaContent = `ORIGINAL: ${img.fileName}\nCHARACTER: ${mapping.characterName}\nPROMPT: ${prompt}\n\nSCENE DATA:\n${tFile.content}`;
                    downloadFile(metaContent, `${base}_meta.txt`);
                    downloadFile(gen.imageBase64, result.newName, true);
                    
                    setResults(prev => [...prev, result]);
                    addLog(`DOWNLOADED: ${result.newName}`);
                } else {
                    addLog(`REVISION FAILED FOR ${img.fileName}. SKIPPING.`);
                }
            } catch (err) {
                addLog(`CRITICAL ERROR [${img.fileName}]: ${err}`);
            }
        }

        setStage('COMPLETE');
        addLog("ALL SEQUENCES FINALIZED.");
    };

    // AUTOMATION EFFECT
    useEffect(() => {
        if (stage === 'ANALYZING' && fullScript) {
            runAnalysis();
        } else if (stage === 'PROCESSING' && characterBible) {
            processProductionRun();
        }
    }, [stage, fullScript, characterBible]);

    return (
        <div className="h-screen bg-black text-slate-100 font-mono flex flex-col overflow-hidden selection:bg-red-600">
            <header className="shrink-0 p-6 border-b border-red-900/40 bg-zinc-950 flex flex-col items-center">
                <h1 className="text-4xl sm:text-6xl font-black text-red-600 uppercase tracking-tighter italic drop-shadow-[0_0_10px_rgba(220,38,38,0.4)]">
                    Ben Shapeshiftiro
                </h1>
                <p className="text-red-900 font-bold tracking-[0.3em] uppercase text-[10px] mt-1">Production Console v8.0 AUTOPILOT</p>
            </header>

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
                <div className="lg:col-span-4 p-6 space-y-6 border-r border-red-900/20 bg-zinc-950 overflow-y-auto">
                    <section className="bg-zinc-900/50 border border-red-900/40 p-5 rounded-sm shadow-xl">
                        <h2 className="text-xs font-black text-red-500 uppercase mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse"></span>
                            CONTROL_DECK
                        </h2>
                        
                        <div className="space-y-3">
                            {stage === 'IDLE' && (
                                <>
                                    <input type="file" multiple className="hidden" id="zip-upload" onChange={handleUpload} disabled={isUploading} accept=".zip" />
                                    <label htmlFor="zip-upload" className="w-full text-center block cursor-pointer px-6 py-3 bg-red-700 hover:bg-red-600 font-black text-sm uppercase italic border border-red-500/30 transition-all">
                                        {isUploading ? 'LOADING...' : 'LOAD ASSET ARCHIVES'}
                                    </label>
                                </>
                            )}
                            
                            {(stage === 'ANALYZING' || stage === 'PROCESSING') && (
                                <p className="text-center text-zinc-500 italic text-sm py-3">AUTOMATED SEQUENCE RUNNING...</p>
                            )}
                            
                            {stage === 'COMPLETE' && (
                                <p className="text-center text-green-500 font-black text-lg py-3">PRODUCTION COMPLETE</p>
                            )}
                        </div>
                    </section>
                </div>

                <div className="lg:col-span-8 flex flex-col bg-black overflow-hidden relative">
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div 
                            ref={consoleScrollRef}
                            className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-[10px] bg-black"
                        >
                            {logs.length === 0 && <p className="text-zinc-800 italic uppercase opacity-40">System ready. Waiting for archive injection...</p>}
                            {logs.map((log, i) => {
                                const isError = log.includes('CRITICAL') || log.includes('ERROR');
                                const isSuccess = log.includes('DOWNLOADED') || log.includes('READY');
                                return (
                                    <div key={i} className={`flex gap-3 px-2 py-0.5 border-l-2 transition-colors ${
                                        isError ? 'border-red-600 text-red-400 bg-red-950/20' : 
                                        isSuccess ? 'border-green-600 text-green-400 bg-green-950/10' :
                                        'border-zinc-800 text-zinc-500'
                                    }`}>
                                        <span className="opacity-20 select-none text-[8px] w-8">[{i.toString().padStart(4, '0')}]</span>
                                        <span className="flex-1">{log}</span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="bg-zinc-950 px-4 py-2 border-t border-red-900/30 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2">
                                {(stage === 'PROCESSING' || stage === 'ANALYZING') && <div className="w-1.5 h-1.5 bg-red-600 animate-ping rounded-full"></div>}
                                <span className="text-[10px] font-black text-red-600 uppercase truncate max-w-[200px] sm:max-w-md">{status}</span>
                            </div>
                            <span className="text-[9px] text-zinc-700 font-black uppercase tracking-widest">{stage}</span>
                        </div>
                    </div>

                    {(results.length > 0) && (
                        <div className="shrink-0 h-24 bg-zinc-950 border-t border-red-900/40 p-2 flex gap-2 overflow-x-auto">
                            {results.slice(-15).reverse().map((item, idx) => (
                                <div key={idx} className="h-full aspect-square bg-zinc-900 border border-red-900/20 group relative overflow-hidden shrink-0">
                                    <img src={`data:image/png;base64,${item.base64}`} alt="Frame" className="w-full h-full object-cover" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default App;