import React, { useState, useEffect } from 'react';
import './BibleView.css';
import { NavigationTarget, Topic } from '../App';

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
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, verseId: number } | null>(null);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [selectedTopicId, setSelectedTopicId] = useState<number | undefined>(undefined);
    const [isAddingTopic, setIsAddingTopic] = useState(false);
    const [newTopicName, setNewTopicName] = useState('');

    // Load initial data
    useEffect(() => {
        async function loadData() {
            try {
                const [trans, bks, tops] = await Promise.all([
                    window.electronAPI.getTranslations(),
                    window.electronAPI.getBooks(),
                    window.electronAPI.getTopics()
                ]);
                setTranslations(trans);
                setBooks(bks);
                setTopics(tops);

                // Set default translation to KJV if available, otherwise first available
                let currentTranslationId = selectedTranslation;
                if (currentTranslationId === 0 && trans.length > 0) {
                    const kjv = trans.find(t => t.code.includes('KJV') || t.name.includes('King James'));
                    currentTranslationId = kjv ? kjv.id : trans[0].id;
                    setSelectedTranslation(currentTranslationId);
                }

                // Handle initial navigation target
                if (initialTarget && bks.length > 0) {
                    // Find target book
                    let targetBook: Book | undefined;
                    if (initialTarget.bookId) {
                        targetBook = bks.find(b => b.id === initialTarget.bookId);
                    }

                    if (targetBook) {
                        setSelectedBook(targetBook);
                        if (initialTarget.chapter) setSelectedChapter(initialTarget.chapter);
                    } else if (!selectedBook) {
                        setSelectedBook(bks[0]);
                    }

                    if (initialTarget.translationId) {
                        setSelectedTranslation(initialTarget.translationId);
                    } else if (currentTranslationId === 0) {
                        // Fallback if target has no translation and we don't have one selected yet
                        if (trans.length > 0) setSelectedTranslation(trans[0].id);
                    }

                    // Clear the target so it doesn't re-trigger
                    if (onTargetConsumed) onTargetConsumed();
                } else if (!selectedBook && bks.length > 0) {
                    setSelectedBook(bks[0]);
                }

                setLoading(false);
            } catch (err) {
                console.error('Failed to load data:', err);
                setLoading(false);
            }
        }
        loadData();
    }, [initialTarget]); // Re-run if target changes

    // Load chapter count when book changes
    useEffect(() => {
        async function loadChapterCount() {
            if (selectedBook && selectedTranslation > 0) {
                const count = await window.electronAPI.getChapterCount(selectedBook.id, selectedTranslation);
                setChapterCount(count);
            }
        }
        loadChapterCount();
    }, [selectedBook, selectedTranslation]);

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

    const handleContextMenu = (e: React.MouseEvent, verseId: number) => {
        e.preventDefault();
        // Check if verse already has a topic to pre-select it
        const currentVerse = verses.find(v => v.id === verseId);
        setSelectedTopicId(currentVerse?.topic_id);

        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            verseId
        });
        setActiveHighlightId(null); // Close old picker if any
    };

    const handleHighlight = async (verseId: number, color: string) => {
        const resultColor = await window.electronAPI.toggleHighlight(verseId, color, selectedTopicId);
        // Optimistic update
        setVerses(prev => prev.map(v =>
            v.id === verseId ? { ...v, color: resultColor || undefined, topic_id: selectedTopicId } : v
        ));
        setContextMenu(null);
        setSelectedTopicId(undefined);
    };

    // Close menu on click away
    useEffect(() => {
        const handleClickAway = () => setContextMenu(null);
        window.addEventListener('click', handleClickAway);
        return () => window.removeEventListener('click', handleClickAway);
    }, []);

    const handleCreateTopic = async () => {
        if (!newTopicName.trim()) return;
        const newId = await window.electronAPI.createTopic(newTopicName);
        if (newId) {
            const updatedTopics = await window.electronAPI.getTopics();
            setTopics(updatedTopics);
            setSelectedTopicId(Number(newId));
            setNewTopicName('');
            setIsAddingTopic(false);
        }
    };

    if (loading) {
        return <div className="bible-view loading">Loading...</div>;
    }

    return (
        <div className="bible-view">
            {/* Context Menu Overlay */}
            {contextMenu && (
                <div
                    className="context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="menu-section">
                        <div className="menu-label">Highlight Color</div>
                        <div className="picker-colors">
                            <div className="color-option yellow" onClick={() => handleHighlight(contextMenu.verseId, 'yellow')} title="Yellow" />
                            <div className="color-option green" onClick={() => handleHighlight(contextMenu.verseId, 'green')} title="Green" />
                            <div className="color-option blue" onClick={() => handleHighlight(contextMenu.verseId, 'blue')} title="Blue" />
                            <div className="color-option pink" onClick={() => handleHighlight(contextMenu.verseId, 'pink')} title="Pink" />
                            <div className="color-option clear" onClick={() => handleHighlight(contextMenu.verseId, '')} title="Clear" />
                        </div>
                    </div>

                    <div className="menu-separator" />

                    <div className="menu-section">
                        <div className="menu-label">Topic / Favorite</div>
                        <div className="picker-topic">
                            <select
                                value={selectedTopicId || ''}
                                onChange={(e) => setSelectedTopicId(e.target.value ? Number(e.target.value) : undefined)}
                                className="topic-miniselect"
                            >
                                <option value="">No Topic</option>
                                {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <button className="add-topic-btn" onClick={() => setIsAddingTopic(!isAddingTopic)}>+</button>
                        </div>
                        {isAddingTopic && (
                            <div className="new-topic-row">
                                <input
                                    value={newTopicName}
                                    onChange={(e) => setNewTopicName(e.target.value)}
                                    placeholder="New topic..."
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTopic()}
                                    autoFocus
                                />
                                <button onClick={handleCreateTopic}>Add</button>
                            </div>
                        )}
                    </div>

                    <div className="menu-info">Changes auto-save on color pick</div>
                </div>
            )}

            <aside className="book-selector">
                <h2 className="selector-title">Books</h2>
                <ul className="book-list">
                    {books.map((book) => (
                        <li key={book.id}>
                            <button
                                className={`book-item ${selectedBook?.id === book.id ? 'active' : ''}`}
                                onClick={() => {
                                    setSelectedBook(book);
                                    setSelectedChapter(1); // Reset to ch 1 on manual book change
                                }}
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
                    {verses.map((verse) => (
                        <div
                            key={verse.id}
                            className={`verse-row ${verse.color ? 'highlight-' + verse.color : ''}`}
                            onContextMenu={(e) => handleContextMenu(e, verse.id)}
                        >
                            <sup
                                className="verse-number"
                            >
                                {verse.verse}
                            </sup>
                            <span className="verse-text">{verse.text}</span>
                        </div>
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
                    <div className="chapter-selector-input">
                        <input
                            type="number"
                            min={1}
                            max={chapterCount}
                            value={selectedChapter}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val)) {
                                    if (val >= 1 && val <= chapterCount) {
                                        setSelectedChapter(val);
                                    }
                                }
                            }}
                            className="chapter-direct-input"
                        />
                        <span className="chapter-count-label">/ {chapterCount}</span>
                    </div>
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
