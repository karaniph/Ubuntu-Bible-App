import React, { useState, useEffect } from 'react';
import './BibleView.css';
import { NavigationTarget } from '../App';

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
    color?: string; // yellow, green, blue, pink
}

interface Translation {
    id: number;
    code: string;
    name: string;
}

interface BibleViewProps {
    initialTarget?: NavigationTarget | null;
    onTargetConsumed?: () => void;
}

export default function BibleView({ initialTarget, onTargetConsumed }: BibleViewProps) {
    const [translations, setTranslations] = useState<Translation[]>([]);
    const [books, setBooks] = useState<Book[]>([]);
    const [verses, setVerses] = useState<Verse[]>([]);
    const [selectedTranslation, setSelectedTranslation] = useState<number>(0);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const [selectedChapter, setSelectedChapter] = useState<number>(1);
    const [chapterCount, setChapterCount] = useState<number>(1);
    const [loading, setLoading] = useState(true);

    // Highlighting state
    const [activeHighlightId, setActiveHighlightId] = useState<number | null>(null);

    // ... (useEffect for loadData remains same)

    // Load verses when book/chapter/translation changes
    useEffect(() => {
        async function loadVerses() {
            if (selectedBook && selectedTranslation > 0) {
                const v = await window.electronAPI.getVerses(selectedTranslation, selectedBook.id, selectedChapter);
                setVerses(v);
                setActiveHighlightId(null); // Clear picker on nav
            }
        }
        loadVerses();
    }, [selectedBook, selectedChapter, selectedTranslation]);

    const handleHighlight = async (verseId: number, color: string) => {
        const resultColor = await window.electronAPI.toggleHighlight(verseId, color);
        // Optimistic update
        setVerses(prev => prev.map(v =>
            v.id === verseId ? { ...v, color: resultColor || undefined } : v
        ));
        setActiveHighlightId(null);
    };

    // ... (rest of render)

                <div className="verses-container">
                    {verses.map((verse) => (
                        <p 
                            key={verse.id} 
                            className={`verse-row ${verse.color ? 'highlight-' + verse.color : ''}`}
                        >
                            {activeHighlightId === verse.id && (
                                <div className="highlight-picker">
                                    <div className="color-option yellow" onClick={() => handleHighlight(verse.id, 'yellow')} title="Yellow" />
                                    <div className="color-option green" onClick={() => handleHighlight(verse.id, 'green')} title="Green" />
                                    <div className="color-option blue" onClick={() => handleHighlight(verse.id, 'blue')} title="Blue" />
                                    <div className="color-option pink" onClick={() => handleHighlight(verse.id, 'pink')} title="Pink" />
                                    <div className="color-option clear" onClick={() => handleHighlight(verse.id, verse.color || '')} title="Clear" />
                                </div>
                            )}
                            <sup 
                                className="verse-number" 
                                onClick={() => setActiveHighlightId(activeHighlightId === verse.id ? null : verse.id)}
                                title="Click to highlight"
                            >
                                {verse.verse}
                            </sup>
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
            </div >
        </div >
    );
}
