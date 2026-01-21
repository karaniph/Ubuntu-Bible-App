import React, { useState, useEffect } from 'react';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import './BibleView.css';

interface Book {
    id: number;
    code: string;
    name: string;
    order_index: number;
}

interface Verse {
    id: number;
    book_code: string;
    book_name: string;
    chapter: number;
    verse: number;
    text: string;
}

interface Translation {
    id: number;
    code: string;
    name: string;
}

export default function BibleView() {
    const [translations, setTranslations] = useState<Translation[]>([]);
    const [books, setBooks] = useState<Book[]>([]);
    const [verses, setVerses] = useState<Verse[]>([]);
    const [selectedTranslation, setSelectedTranslation] = useState<number>(1);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const [selectedChapter, setSelectedChapter] = useState<number>(1);
    const [chapterCount, setChapterCount] = useState<number>(1);
    const [loading, setLoading] = useState(true);

    // Text-to-Speech
    const tts = useTextToSpeech();

    // Load initial data
    useEffect(() => {
        async function loadData() {
            try {
                const [trans, bks] = await Promise.all([
                    window.electronAPI.getTranslations(),
                    window.electronAPI.getBooks(),
                ]);
                setTranslations(trans);
                setBooks(bks);
                if (bks.length > 0) {
                    setSelectedBook(bks[0]);
                }
                setLoading(false);
            } catch (err) {
                console.error('Failed to load data:', err);
                setLoading(false);
            }
        }
        loadData();
    }, []);

    // Load chapter count when book changes
    useEffect(() => {
        async function loadChapterCount() {
            if (selectedBook) {
                const count = await window.electronAPI.getChapterCount(selectedBook.id, selectedTranslation);
                setChapterCount(count);
                setSelectedChapter(1);
            }
        }
        loadChapterCount();
    }, [selectedBook, selectedTranslation]);

    // Load verses when book/chapter/translation changes
    useEffect(() => {
        async function loadVerses() {
            if (selectedBook) {
                const v = await window.electronAPI.getVerses(selectedTranslation, selectedBook.id, selectedChapter);
                setVerses(v);
            }
        }
        loadVerses();
    }, [selectedBook, selectedChapter, selectedTranslation]);

    // Stop TTS when chapter changes
    useEffect(() => {
        tts.stop();
    }, [selectedBook, selectedChapter]);

    const handleListen = () => {
        if (tts.isPlaying && !tts.isPaused) {
            tts.pause();
        } else if (tts.isPaused) {
            tts.resume();
        } else {
            const texts = verses.map(v => `Verse ${v.verse}. ${v.text}`);
            tts.speak(texts);
        }
    };

    if (loading) {
        return <div className="bible-view loading">Loading...</div>;
    }

    return (
        <div className="bible-view">
            <aside className="book-selector">
                <h2 className="selector-title">Books</h2>
                <ul className="book-list">
                    {books.map((book) => (
                        <li key={book.id}>
                            <button
                                className={`book-item ${selectedBook?.id === book.id ? 'active' : ''}`}
                                onClick={() => setSelectedBook(book)}
                            >
                                {book.name}
                            </button>
                        </li>
                    ))}
                </ul>
            </aside>

            <div className="reading-area">
                <header className="reading-header">
                    <h1 className="chapter-title">
                        {selectedBook?.name} {selectedChapter}
                    </h1>
                    <div className="header-controls">
                        {/* Text-to-Speech Button */}
                        <button
                            className={`tts-button ${tts.isPlaying ? 'playing' : ''}`}
                            onClick={handleListen}
                            title={tts.isPlaying ? (tts.isPaused ? 'Resume' : 'Pause') : 'Listen to chapter'}
                        >
                            {tts.isPlaying ? (tts.isPaused ? '▶️ Resume' : '⏸️ Pause') : '🔊 Listen'}
                        </button>
                        {tts.isPlaying && (
                            <button className="tts-stop" onClick={tts.stop} title="Stop">
                                ⏹️
                            </button>
                        )}
                        <select
                            className="translation-select"
                            value={selectedTranslation}
                            onChange={(e) => setSelectedTranslation(Number(e.target.value))}
                        >
                            {translations.map((t) => (
                                <option key={t.id} value={t.id}>{t.code}</option>
                            ))}
                        </select>
                    </div>
                </header>

                <div className="verses-container">
                    {verses.map((verse, index) => (
                        <p
                            key={verse.id}
                            className={`verse-row ${tts.isPlaying && tts.currentIndex === index ? 'speaking' : ''}`}
                        >
                            <sup className="verse-number">{verse.verse}</sup>
                            <span className="verse-text">{verse.text}</span>
                        </p>
                    ))}
                </div>

                <footer className="chapter-nav">
                    <button
                        className="nav-button"
                        disabled={selectedChapter <= 1}
                        onClick={() => setSelectedChapter((c) => c - 1)}
                    >
                        ← Previous
                    </button>
                    <span className="chapter-indicator">
                        {selectedChapter} / {chapterCount}
                    </span>
                    <button
                        className="nav-button"
                        disabled={selectedChapter >= chapterCount}
                        onClick={() => setSelectedChapter((c) => c + 1)}
                    >
                        Next →
                    </button>
                </footer>
            </div>
        </div>
    );
}
