import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob as GenAIBlob } from '@google/genai';
import { decode, encode, decodeAudioData } from '../utils/audio';
import { BotIcon, MicIcon, StopIcon, UserIcon } from './icons';

interface Transcript {
    user: string;
    model: string;
    isFinal: boolean;
}

const LiveConversation: React.FC = () => {
    const [isSessionActive, setIsSessionActive] = useState(false);
    const [statusMessage, setStatusMessage] = useState('Click "Start Conversation" to begin.');
    const [transcripts, setTranscripts] = useState<Transcript[]>([]);
    
    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const audioContextRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    
    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');

    const stopSession = useCallback(() => {
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close());
            sessionPromiseRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.input.close();
            audioContextRef.current.output.close();
            audioContextRef.current = null;
        }

        audioSourcesRef.current.forEach(source => source.stop());
        audioSourcesRef.current.clear();
        nextStartTimeRef.current = 0;

        setIsSessionActive(false);
        setStatusMessage('Session ended. Click "Start Conversation" to begin again.');
    }, []);

    const handleStart = async () => {
        setStatusMessage('Requesting microphone access...');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            setStatusMessage('Initializing session...');
            
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

            // FIX: Use `(window as any).webkitAudioContext` for cross-browser compatibility to resolve TypeScript error.
            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            // FIX: Use `(window as any).webkitAudioContext` for cross-browser compatibility to resolve TypeScript error.
            const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            audioContextRef.current = { input: inputAudioContext, output: outputAudioContext };
            
            setTranscripts([]);
            currentInputTranscriptionRef.current = '';
            currentOutputTranscriptionRef.current = '';

            // FIX: Use a local promise variable for session connection to align with Gemini API guidelines.
            const sessionPromise = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        const source = inputAudioContext.createMediaStreamSource(stream);
                        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;

                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const createBlob = (data: Float32Array): GenAIBlob => {
                                const int16 = new Int16Array(data.length);
                                for (let i = 0; i < data.length; i++) {
                                    int16[i] = data[i] * 32768;
                                }
                                return {
                                    data: encode(new Uint8Array(int16.buffer)),
                                    mimeType: 'audio/pcm;rate=16000',
                                };
                            };
                            const pcmBlob = createBlob(inputData);
                            
                            // FIX: Per Gemini API guidelines, rely on the promise to resolve without extra conditional checks.
                            sessionPromise.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);
                        setStatusMessage('Connected. Listening...');
                        setIsSessionActive(true);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) {
                            currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                            setTranscripts(prev => {
                                const last = prev[prev.length - 1];
                                if (last && !last.isFinal) {
                                    return [...prev.slice(0, -1), { ...last, user: currentInputTranscriptionRef.current }];
                                }
                                return [...prev, { user: currentInputTranscriptionRef.current, model: '', isFinal: false }];
                            });
                        }

                        if (message.serverContent?.outputTranscription) {
                            currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                             setTranscripts(prev => {
                                const last = prev[prev.length - 1];
                                if(last) {
                                     return [...prev.slice(0, -1), { ...last, model: currentOutputTranscriptionRef.current }];
                                }
                                return prev;
                            });
                        }
                        
                        if (message.serverContent?.turnComplete) {
                            const fullInput = currentInputTranscriptionRef.current;
                            const fullOutput = currentOutputTranscriptionRef.current;
                            setTranscripts(prev => {
                                const last = prev[prev.length - 1];
                                if (last && !last.isFinal) {
                                     return [...prev.slice(0, -1), { user: fullInput, model: fullOutput, isFinal: true }];
                                }
                                return prev;
                            });
                            currentInputTranscriptionRef.current = '';
                            currentOutputTranscriptionRef.current = '';
                        }

                        const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (audioData && audioContextRef.current) {
                            const outputCtx = audioContextRef.current.output;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                            const audioBuffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
                            
                            const source = outputCtx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputCtx.destination);
                            
                            source.addEventListener('ended', () => audioSourcesRef.current.delete(source));
                            
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            audioSourcesRef.current.add(source);
                        }

                        // FIX: Handle conversation interruptions to stop audio playback.
                        const interrupted = message.serverContent?.interrupted;
                        if (interrupted) {
                            for (const source of audioSourcesRef.current) {
                                source.stop();
                            }
                            audioSourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Session error:', e);
                        setStatusMessage(`Error: ${e.message}. Please try again.`);
                        stopSession();
                    },
                    onclose: () => {
                        setStatusMessage('Session closed.');
                        stopSession();
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    outputAudioTranscription: {},
                    inputAudioTranscription: {},
                },
            });
            sessionPromiseRef.current = sessionPromise;
        } catch (error) {
            console.error('Failed to start session:', error);
            setStatusMessage('Error: Could not access microphone or initialize session.');
            setIsSessionActive(false);
        }
    };

    const handleStop = () => {
        stopSession();
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopSession();
        };
    }, [stopSession]);

    return (
        <div className="flex flex-col h-full bg-gray-800 rounded-lg m-4 p-6 shadow-2xl items-center justify-between">
            <div className="w-full text-center">
                <p className="text-gray-400 mb-4">{statusMessage}</p>
                 <div className="w-full h-96 bg-gray-900 rounded-lg p-4 overflow-y-auto flex flex-col space-y-4">
                     {transcripts.map((t, i) => (
                        <div key={i}>
                            <div className="flex items-start space-x-3 justify-end mb-2">
                                <p className={`bg-cyan-600 p-3 rounded-lg max-w-lg ${!t.user && 'hidden'}`}>{t.user}</p>
                                <div className="p-2 bg-gray-700 rounded-full"><UserIcon className="w-6 h-6 text-gray-300" /></div>
                            </div>
                            <div className="flex items-start space-x-3">
                                <div className="p-2 bg-gray-700 rounded-full"><BotIcon className="w-6 h-6 text-cyan-400" /></div>
                                <p className={`bg-gray-700 p-3 rounded-lg max-w-lg ${!t.model && 'hidden'}`}>{t.model || '...'}</p>
                            </div>
                        </div>
                     ))}
                 </div>
            </div>

            <div className="flex items-center justify-center">
                {!isSessionActive ? (
                    <button onClick={handleStart} className="flex flex-col items-center justify-center w-32 h-32 bg-cyan-500 rounded-full text-white hover:bg-cyan-600 transition-all duration-300 transform hover:scale-105 shadow-lg">
                        <MicIcon className="w-12 h-12 mb-1" />
                        <span className="font-semibold">Start</span>
                    </button>
                ) : (
                    <button onClick={handleStop} className="flex flex-col items-center justify-center w-32 h-32 bg-red-500 rounded-full text-white hover:bg-red-600 transition-all duration-300 transform hover:scale-105 shadow-lg">
                        <StopIcon className="w-12 h-12 mb-1" />
                         <span className="font-semibold">Stop</span>
                    </button>
                )}
            </div>
            <div className="h-12"></div>
        </div>
    );
};

export default LiveConversation;
