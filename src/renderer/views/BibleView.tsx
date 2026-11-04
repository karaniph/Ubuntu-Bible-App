import React, { useState, useEffect, useRef } from 'react';
import './BibleView.css';
import { NavigationTarget, Topic } from '../App';
import {
    AppSettings, LINE_HEIGHTS, TEXT_SIZES,
    loadLastRead, saveLastRead, stripPilcrow, translationLabel,
} from '../lib/storage';

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
    topic_id?: number;
}

interface Translation {
    id: number;
    code: string;
    name: string;
}

interface BibleViewProps {
    initialTarget?: NavigationTarget | null;
    onTargetConsumed?: () => void;
    onError?: (message: string) => void;
    onToast?: (message: string) => void;
    settings: AppSettings;
}

export default function BibleView({ initialTarget, onTargetConsumed, onError, onToast, settings }: BibleViewProps) {
    const [translations, setTranslations] = useState<Translation[]>([]);
    const [books, setBooks] = useState<Book[]>([]);
    const [verses, setVerses] = useState<Verse[]>([]);
    const [selectedTranslation, setSelectedTranslation] = useState<number>(0);
    const [selectedBook, setSelectedBook] = useState<Book | null>(null);
    const [selectedChapter, setSelectedChapter] = useState<number>(1);
    const [tempChapterValue, setTempChapterValue] = useState<string>('1');
    const [chapterCount, setChapterCount] = useState<number>(1);
    const [loading, setLoading] = useState(true);
    // Temporary "you jumped here" highlight. UI only: never saved anywhere.
    const [focus, setFocus] = useState<{ bookId: number; chapter: number; start: number; end: number; nonce: number } | null>(null);
    const focusNonce = useRef(0);
    const focusHandled = useRef(0);
    const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (focusTimer.current) clearTimeout(focusTimer.current); }, []);

    // Sync temp value when chapter changes externally (e.g. Next/Prev buttons)
    useEffect(() => {
        setTempChapterValue(selectedChapter.toString());
    }, [selectedChapter]);

    const commitChapterChange = (value: string) => {
        const val = parseInt(value);
        if (!isNaN(val)) {
            const clamped = Math.max(1, Math.min(val, chapterCount));
            setSelectedChapter(clamped);
            // Ensure temp value is consistent with the clamped value
            setTempChapterValue(clamped.toString());
        } else {
            // Reset to current chapter if input is invalid
            setTempChapterValue(selectedChapter.toString());
        }
    };

    // Highlighting state
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
                const lastRead = loadLastRead();
                if (currentTranslationId === 0 && trans.length > 0) {
                    const remembered = lastRead && trans.find(t => t.id === lastRead.translationId);
                    const kjv = trans.find(t => t.code.includes('KJV') || t.name.includes('King James'));
                    currentTranslationId = remembered ? remembered.id : kjv ? kjv.id : trans[0].id;
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
                        if (initialTarget.verse) {
                            focusNonce.current += 1;
                            setFocus({
                                bookId: targetBook.id,
                                chapter: initialTarget.chapter || 1,
                                start: initialTarget.verse,
                                end: initialTarget.verseEnd && initialTarget.verseEnd > initialTarget.verse
                                    ? initialTarget.verseEnd : initialTarget.verse,
                                nonce: focusNonce.current,
                            });
                        }
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
                    // Reopen where the user left off; fresh installs get Genesis 1.
                    const savedBook = lastRead?.bookId ? bks.find(b => b.id === lastRead.bookId) : undefined;
                    setSelectedBook(savedBook || bks[0]);
                    if (savedBook && lastRead?.chapter) setSelectedChapter(lastRead.chapter);
                }

                setLoading(false);
            } catch (err) {
                console.error('Failed to load data:', err);
                onError?.('Could not load Bible data.');
                setLoading(false);
            }
        }
        loadData();
    }, [initialTarget]); // Re-run if target changes

    // Load chapter count when book changes
    useEffect(() => {
        async function loadChapterCount() {
            if (selectedBook && selectedTranslation > 0) {
                try {
                    const count = await window.electronAPI.getChapterCount(selectedBook.id, selectedTranslation);
                    setChapterCount(count);
                    // A remembered chapter may not exist in this translation.
                    if (count > 0) setSelectedChapter((c) => Math.min(c, count));
                } catch {
                    onError?.('Could not load chapter count.');
                }
            }
        }
        loadChapterCount();
    }, [selectedBook, selectedTranslation, onError]);

    // Load verses when book/chapter/translation changes
    useEffect(() => {
        async function loadVerses() {
            if (selectedBook && selectedTranslation > 0) {
                try {
                    const v = await window.electronAPI.getVerses(selectedTranslation, selectedBook.id, selectedChapter);
                    setVerses(v);
                } catch {
                    onError?.('Could not load verses for this chapter.');
                }
            }
        }
        loadVerses();
    }, [selectedBook, selectedChapter, selectedTranslation, onError]);

    // Remember the reading position (display preferences live in App settings).
    useEffect(() => {
        if (!loading && selectedBook && selectedTranslation > 0) {
            saveLastRead({ translationId: selectedTranslation, bookId: selectedBook.id, chapter: selectedChapter });
        }
    }, [loading, selectedBook, selectedChapter, selectedTranslation]);

    // Scroll the jumped-to verse(s) into view once the right chapter is loaded,
    // then let the soft highlight fade away.
    useEffect(() => {
        if (!focus || focus.nonce === focusHandled.current) return;
        if (!selectedBook || selectedBook.id !== focus.bookId || selectedChapter !== focus.chapter) return;
        if (!verses.some(v => v.chapter === focus.chapter && v.verse === focus.start && v.book_code === selectedBook.code)) return;
        focusHandled.current = focus.nonce;
        const el = document.getElementById(`verse-${focus.start}`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (focusTimer.current) clearTimeout(focusTimer.current);
        focusTimer.current = setTimeout(() => setFocus(null), 3200);
    }, [focus, verses, selectedBook, selectedChapter]);

    const isFocused = (verse: Verse) =>
        !!focus && !!selectedBook && focus.bookId === selectedBook.id && focus.chapter === selectedChapter &&
        verse.verse >= focus.start && verse.verse <= focus.end;

    const handleCopy = async (verseId: number) => {
        setContextMenu(null);
        const verse = verses.find(v => v.id === verseId);
        const clean = verse ? stripPilcrow(verse.text) : '';
        if (!verse || !clean) {
            onError?.('Nothing to copy for this verse.');
            return;
        }
        const code = translations.find(t => t.id === selectedTranslation)?.code ?? '';
        const text = `\u201C${clean}\u201D ${verse.book_name} ${verse.chapter}:${verse.verse} (${translationLabel(code)})`;
        let ok = false;
        try {
            ok = await window.electronAPI.copyText(text);
        } catch {
            ok = false;
        }
        if (!ok) {
            try {
                await navigator.clipboard.writeText(text);
                ok = true;
            } catch {
                ok = false;
            }
        }
        if (ok) onToast?.('Copied');
        else onError?.('Could not copy the verse.');
    };

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
    };

    const handleHighlight = async (verseId: number, color: string) => {
        try {
            const resultColor = await window.electronAPI.toggleHighlight(verseId, color, selectedTopicId);
            setVerses(prev => prev.map(v =>
                v.id === verseId ? { ...v, color: resultColor || undefined, topic_id: selectedTopicId } : v
            ));
            setContextMenu(null);
            setSelectedTopicId(undefined);
        } catch {
            onError?.('Could not save highlight.');
        }
    };

    // Close menu on click away
    useEffect(() => {
        const handleClickAway = () => setContextMenu(null);
        window.addEventListener('click', handleClickAway);
        return () => window.removeEventListener('click', handleClickAway);
    }, []);

    const handleCreateTopic = async () => {
        if (!newTopicName.trim()) return;
        try {
            const newId = await window.electronAPI.createTopic(newTopicName);
            if (newId) {
                const updatedTopics = await window.electronAPI.getTopics();
                setTopics(updatedTopics);
                setSelectedTopicId(Number(newId));
                setNewTopicName('');
                setIsAddingTopic(false);
            }
        } catch {
            onError?.('Could not create topic.');
        }
    };

    // A pilcrow (¶) at the start of a verse marks a paragraph start.
    const paragraphs: Verse[][] = [];
    for (const verse of verses) {
        if (paragraphs.length === 0 || verse.text.trimStart().startsWith('¶')) paragraphs.push([]);
        paragraphs[paragraphs.length - 1].push(verse);
    }

    const renderVerse = (verse: Verse, inline: boolean) => {
        const text = stripPilcrow(verse.text);
        const startsParagraph = verse.text.trimStart().startsWith('¶');
        const Row = inline ? 'span' : 'div';
        return (
            <Row
                key={verse.id}
                id={`verse-${verse.verse}`}
                className={[
                    'verse-row',
                    inline ? 'verse-inline' : '',
                    startsParagraph && !inline ? 'paragraph-start' : '',
                    verse.color ? 'highlight-' + verse.color : '',
                    isFocused(verse) ? 'verse-focus' : '',
                ].filter(Boolean).join(' ')}
                onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, verse.id)}
            >
                {settings.showVerseNumbers && (
                    <sup className="verse-number">{verse.verse}</sup>
                )}
                {text ? (
                    <span className="verse-text">{text}{inline ? ' ' : ''}</span>
                ) : (
                    // Some translations (e.g. Darby) omit verses found in
                    // other manuscripts, such as Matthew 23:14 and Acts 8:37.
                    <span className="verse-text verse-omitted">
                        This verse is not included in this translation.
                    </span>
                )}
            </Row>
        );
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
                    <button
                        type="button"
                        className="menu-copy-btn"
                        onClick={() => handleCopy(contextMenu.verseId)}
                    >
                        Copy verse
                    </button>

                    <div className="menu-separator" />

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
                                <option key={t.id} value={t.id}>{t.name || t.code}</option>
                            ))}
                        </select>
                    </div>
                </header>

                <div
                    className={`verses-container reading-${settings.readingMode}`}
                    style={{
                        '--reader-font-size': `${TEXT_SIZES[settings.textSize] ?? 1.1}rem`,
                        '--reader-line-height': LINE_HEIGHTS[settings.lineSpacing] ?? 1.85,
                    } as React.CSSProperties}
                >
                    {settings.readingMode === 'paragraphs'
                        ? paragraphs.map((group, i) => (
                            <p key={i} className="reading-paragraph">
                                {group.map((verse) => renderVerse(verse, true))}
                            </p>
                        ))
                        : verses.map((verse) => renderVerse(verse, false))}
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
                            type="text"
                            inputMode="numeric"
                            value={tempChapterValue}
                            onChange={(e) => {
                                // Only allow digits or empty string while typing
                                if (e.target.value === '' || /^\d+$/.test(e.target.value)) {
                                    setTempChapterValue(e.target.value);
                                }
                            }}
                            onBlur={(e) => commitChapterChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    commitChapterChange((e.target as HTMLInputElement).value);
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
