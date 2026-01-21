import { useState, useCallback, useEffect, useRef } from 'react';

interface TTSState {
    isPlaying: boolean;
    isPaused: boolean;
    currentIndex: number;
}

export function useTextToSpeech() {
    const [state, setState] = useState<TTSState>({
        isPlaying: false,
        isPaused: false,
        currentIndex: 0,
    });

    const [rate, setRate] = useState(0.9);

    // Helpers to prevent garbage collection
    const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            window.speechSynthesis.cancel();
        };
    }, []);

    const speak = useCallback((texts: string[], onComplete?: () => void) => {
        // Stop any current speech
        window.speechSynthesis.cancel();

        // Tiny timeout to ensure clean slate
        setTimeout(() => {
            setState({ isPlaying: true, isPaused: false, currentIndex: 0 });
            let index = 0;

            const speakNext = () => {
                if (index >= texts.length || !state.isPlaying && index > 0) { // Safety check
                    setState(prev => ({ ...prev, isPlaying: false, isPaused: false, currentIndex: 0 }));
                    onComplete?.();
                    return;
                }

                const utterance = new SpeechSynthesisUtterance(texts[index]);
                currentUtterance.current = utterance; // Keep ref to prevent GC

                utterance.rate = rate;
                utterance.pitch = 1;

                // Try to find a good English voice
                const voices = window.speechSynthesis.getVoices();
                const preferredVoice = voices.find(v => v.lang.startsWith('en') && !v.localService) ||
                    voices.find(v => v.lang.startsWith('en'));
                if (preferredVoice) utterance.voice = preferredVoice;

                utterance.onend = () => {
                    index++;
                    setState(prev => ({ ...prev, currentIndex: index }));
                    if (index < texts.length) {
                        speakNext();
                    } else {
                        setState(prev => ({ ...prev, isPlaying: false, isPaused: false, currentIndex: 0 }));
                        onComplete?.();
                    }
                };

                utterance.onerror = (e) => {
                    console.error("TTS Error:", e);
                    setState(prev => ({ ...prev, isPlaying: false, isPaused: false, currentIndex: 0 }));
                };

                window.speechSynthesis.speak(utterance);
            };

            speakNext();
        }, 50);
    }, [rate]);

    const stop = useCallback(() => {
        window.speechSynthesis.cancel();
        setState({ isPlaying: false, isPaused: false, currentIndex: 0 });
    }, []);

    const pause = useCallback(() => {
        window.speechSynthesis.pause();
        setState(s => ({ ...s, isPaused: true }));
    }, []);

    const resume = useCallback(() => {
        window.speechSynthesis.resume();
        setState(s => ({ ...s, isPaused: false }));
    }, []);

    return {
        ...state,
        rate,
        setRate,
        speak,
        stop,
        pause,
        resume,
    };
}
