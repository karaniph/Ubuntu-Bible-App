import { useState, useCallback, useEffect } from 'react';

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

    // Clean up on unmount
    useEffect(() => {
        return () => {
            speechSynthesis.cancel();
        };
    }, []);

    const speak = useCallback((texts: string[], onComplete?: () => void) => {
        speechSynthesis.cancel();
        setState({ isPlaying: true, isPaused: false, currentIndex: 0 });

        let index = 0;

        const speakNext = () => {
            if (index >= texts.length) {
                setState({ isPlaying: false, isPaused: false, currentIndex: 0 });
                onComplete?.();
                return;
            }

            const utterance = new SpeechSynthesisUtterance(texts[index]);
            utterance.rate = rate;
            utterance.pitch = 1;

            utterance.onend = () => {
                index++;
                setState(s => ({ ...s, currentIndex: index }));
                speakNext();
            };

            utterance.onerror = () => {
                setState({ isPlaying: false, isPaused: false, currentIndex: 0 });
            };

            speechSynthesis.speak(utterance);
        };

        speakNext();
    }, [rate]);

    const stop = useCallback(() => {
        speechSynthesis.cancel();
        setState({ isPlaying: false, isPaused: false, currentIndex: 0 });
    }, []);

    const pause = useCallback(() => {
        speechSynthesis.pause();
        setState(s => ({ ...s, isPaused: true }));
    }, []);

    const resume = useCallback(() => {
        speechSynthesis.resume();
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
