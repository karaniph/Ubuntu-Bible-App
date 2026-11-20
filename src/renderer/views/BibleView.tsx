import React, { useState, useEffect, useRef } from 'react';
import './BibleView.css';
import { NavigationTarget, Topic } from '../App';
import {
    AppSettings, LINE_HEIGHTS, TEXT_SIZES,
    loadLastRead, saveLastRead, stripPilcrow, translationLabel,
} from '../lib/storage';
import { HIGHLIGHT_COLORS } from '../lib/highlights';
import { formatVerseRuns, verseRuns } from '../lib/reference';
import { renderSafeHtml } from '../lib/safeHtml';
import type { CommentaryNote, StudySummary } from '../../main/preload';

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
    color?: string; // a HIGHLIGHT_COLORS id: yellow, green, blue, pink, orange, purple, red, teal
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
    commentaryOpen: boolean;
    onToggleCommentary: () => void;
}

export default function BibleView({ initialTarget, onTargetConsumed, onError, onToast, settings, commentaryOpen, onToggleCommentary }: BibleViewProps) {
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

    // Multi-verse selection (verse numbers in this chapter). UI only: never saved.
    const [selected, setSelected] = useState<Set<number>>(() => new Set());
    const selectAnchor = useRef<number | null>(null);
    const [selectionBusy, setSelectionBusy] = useState(false);
    const [studyPicker, setStudyPicker] = useState<{ studies: StudySummary[]; choice: string; newName: string } | null>(null);

    // Commentary panel (Matthew Henry's Concise, from the read-only study.db). The
    // active verse picks which note is highlighted. UI only: never saved.
    const [activeVerse, setActiveVerse] = useState<number | null>(null);
    const [commentary, setCommentary] = useState<{ key: string; notes: CommentaryNote[] } | null>(null);
    const [commentaryError, setCommentaryError] = useState<string | null>(null);
    const commentaryReq = useRef(0);
    const noteRefs = useRef(new Map<number, HTMLElement>());

    const clearSelection = () => {
        setSelected(new Set());
        selectAnchor.current = null;
        setStudyPicker(null);
    };

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
        setActiveVerse(focus.start);
        const el = document.getElementById(`verse-${focus.start}`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (focusTimer.current) clearTimeout(focusTimer.current);
        focusTimer.current = setTimeout(() => setFocus(null), 3200);
    }, [focus, verses, selectedBook, selectedChapter]);

    // A new chapter, book or translation starts with nothing selected.
    useEffect(() => {
        clearSelection();
        setActiveVerse(null);
    }, [selectedBook?.id, selectedChapter, selectedTranslation]);

    // Load the chapter's commentary notes while the panel is open.
    const commentaryKey = selectedBook ? `${selectedBook.code} ${selectedChapter}` : '';
    useEffect(() => {
        if (!commentaryOpen || !selectedBook) return;
        const req = ++commentaryReq.current;
        const key = `${selectedBook.code} ${selectedChapter}`;
        (async () => {
            try {
                const status = await window.electronAPI.getStudyDataStatus();
                if (req !== commentaryReq.current) return;
                if (!status.ready) {
                    setCommentaryError(status.error || "The commentary isn't available right now.");
                    setCommentary(null);
                    return;
                }
                const result = await window.electronAPI.getCommentaryChapter(selectedBook.code, selectedChapter);
                if (req !== commentaryReq.current) return;
                if (!result.ok) {
                    setCommentaryError(result.error);
                    setCommentary(null);
                    return;
                }
                setCommentaryError(null);
                setCommentary({ key, notes: result.value });
            } catch {
                if (req === commentaryReq.current) {
                    setCommentaryError('Could not load the commentary.');
                    setCommentary(null);
                }
            }
        })();
    }, [commentaryOpen, selectedBook?.code, selectedChapter]);

    const commentaryNotes = commentary && commentary.key === commentaryKey ? commentary.notes : [];
    const activeNote = activeVerse === null
        ? null
        : commentaryNotes.find((n) => n.verseStart <= activeVerse && activeVerse <= n.verseEnd) ?? null;
    const activeNoteStart = activeNote ? activeNote.verseStart : null;

    useEffect(() => {
        if (!commentaryOpen || activeNoteStart === null) return;
        noteRefs.current.get(activeNoteStart)?.scrollIntoView({ block: 'nearest' });
    }, [commentaryOpen, activeNoteStart, commentaryKey]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            const target = e.target as HTMLElement | null;
            if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
            clearSelection();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    // Click toggles one verse; Shift-click adds every verse from the last clicked one.
    const handleSelectClick = (e: React.MouseEvent | React.KeyboardEvent, verseNumber: number, fromText: boolean) => {
        if (fromText) {
            // Let drag-to-select text work as before.
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed && sel.toString().trim()) return;
        }
        const anchor = selectAnchor.current;
        if (e.shiftKey && anchor !== null) {
            const [from, to] = anchor <= verseNumber ? [anchor, verseNumber] : [verseNumber, anchor];
            setSelected((prev) => {
                const next = new Set(prev);
                for (const v of verses) if (v.verse >= from && v.verse <= to) next.add(v.verse);
                return next;
            });
        } else {
            setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(verseNumber)) next.delete(verseNumber);
                else next.add(verseNumber);
                return next;
            });
        }
        selectAnchor.current = verseNumber;
    };

    // Shift-click would otherwise extend the browser's text selection.
    const preventShiftSelect = (e: React.MouseEvent) => {
        if (e.shiftKey) e.preventDefault();
    };

    const selectedVerses = verses.filter((v) => selected.has(v.verse)).sort((a, b) => a.verse - b.verse);

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
        if (await writeClipboard(text)) onToast?.('Copied');
        else onError?.('Could not copy the verse.');
    };

    const writeClipboard = async (text: string): Promise<boolean> => {
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
        return ok;
    };

    // Same format as "Copy verse": the texts, then one combined reference, e.g. Psalms 23:1-3 (KJV).
    const handleCopySelected = async () => {
        const texts = selectedVerses.map((v) => stripPilcrow(v.text)).filter(Boolean);
        if (selectedVerses.length === 0 || texts.length === 0) {
            onError?.('Nothing to copy for these verses.');
            return;
        }
        const first = selectedVerses[0];
        const code = translations.find(t => t.id === selectedTranslation)?.code ?? '';
        const runs = formatVerseRuns(verseRuns(selectedVerses.map((v) => v.verse)));
        const text = `\u201C${texts.join(' ')}\u201D ${first.book_name} ${first.chapter}:${runs} (${translationLabel(code)})`;
        if (await writeClipboard(text)) onToast?.(`Copied ${selectedVerses.length} verse${selectedVerses.length === 1 ? '' : 's'}`);
        else onError?.('Could not copy the verses.');
    };

    // Uses the same toggleHighlight as the menu. Verses already in this colour are skipped
    // (so nothing is switched off), and each verse keeps its topic.
    const handleHighlightSelected = async (color: string) => {
        if (selectionBusy || selectedVerses.length === 0) return;
        setSelectionBusy(true);
        const updates = new Map<number, { color?: string; topic_id?: number }>();
        try {
            const existing = new Map<number, { color: string; topic_id: number | null }>();
            for (const h of await window.electronAPI.getHighlights()) existing.set(h.verse_id, h);
            for (const v of selectedVerses) {
                const current = existing.get(v.id);
                if (current?.color === color) continue;
                const topicId = current?.topic_id ?? undefined;
                const resultColor = await window.electronAPI.toggleHighlight(v.id, color, topicId);
                updates.set(v.id, { color: resultColor || undefined, topic_id: topicId });
            }
            const n = selectedVerses.length;
            onToast?.(`Highlighted ${n} verse${n === 1 ? '' : 's'}`);
        } catch {
            onError?.('Could not save highlight.');
        } finally {
            if (updates.size > 0) {
                setVerses((prev) => prev.map((v) => (updates.has(v.id) ? { ...v, ...updates.get(v.id) } : v)));
            }
            setSelectionBusy(false);
        }
    };

    const openStudyPicker = async () => {
        if (studyPicker) {
            setStudyPicker(null);
            return;
        }
        try {
            const studies = await window.electronAPI.listStudies();
            setStudyPicker({ studies, choice: studies[0] ? String(studies[0].id) : 'new', newName: '' });
        } catch {
            onError?.('Could not load your studies.');
        }
    };

    // Each run of consecutive verses becomes one passage, all saved in one call.
    const handleAddSelectionToStudy = async () => {
        if (!studyPicker || selectionBusy || selectedVerses.length === 0) return;
        setSelectionBusy(true);
        try {
            let studyId = Number(studyPicker.choice);
            let studyName = studyPicker.studies.find((s) => s.id === studyId)?.name ?? '';
            if (studyPicker.choice === 'new') {
                const created = await window.electronAPI.createStudy(studyPicker.newName, '');
                if (!created.ok) {
                    onError?.(created.error);
                    return;
                }
                studyId = created.value.id;
                studyName = created.value.name;
            }
            const first = selectedVerses[0];
            const passages = verseRuns(selectedVerses.map((v) => v.verse)).map(([start, end]) => ({
                bookCode: first.book_code,
                chapterStart: first.chapter,
                chapterEnd: first.chapter,
                verseStart: start,
                verseEnd: end,
            }));
            const result = await window.electronAPI.addStudyPassages(studyId, passages);
            if (!result.ok) {
                onError?.(result.error);
                return;
            }
            setStudyPicker(null);
            const n = result.value.length;
            onToast?.(`Added ${n} passage${n === 1 ? '' : 's'} to \u201C${studyName}\u201D`);
        } catch {
            onError?.('Could not add to the study.');
        } finally {
            setSelectionBusy(false);
        }
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
        const isSelected = selected.has(verse.verse);
        // With numbers hidden, or in paragraph mode, the verse text itself is the click target.
        const textSelects = !settings.showVerseNumbers || settings.readingMode === 'paragraphs';
        const textProps = textSelects
            ? {
                onClick: (e: React.MouseEvent) => handleSelectClick(e, verse.verse, true),
                onMouseDown: preventShiftSelect,
            }
            : {};
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
                    isSelected ? 'verse-selected' : '',
                ].filter(Boolean).join(' ')}
                onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, verse.id)}
                onClick={() => setActiveVerse(verse.verse)}
            >
                {settings.showVerseNumbers && (
                    <sup
                        className="verse-number"
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        title="Select verse (Shift-click selects a run)"
                        onFocus={() => setActiveVerse(verse.verse)}
                        onClick={(e) => handleSelectClick(e, verse.verse, false)}
                        onMouseDown={preventShiftSelect}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleSelectClick(e, verse.verse, false);
                            }
                        }}
                    >
                        {verse.verse}
                    </sup>
                )}
                {text ? (
                    <span className={`verse-text${textSelects ? ' verse-text-selectable' : ''}`} {...textProps}>
                        {text}{inline ? ' ' : ''}
                    </span>
                ) : (
                    // Some translations (e.g. Darby) omit verses found in
                    // other manuscripts, such as Matthew 23:14 and Acts 8:37.
                    <span className={`verse-text verse-omitted${textSelects ? ' verse-text-selectable' : ''}`} {...textProps}>
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
                            {HIGHLIGHT_COLORS.map((c) => (
                                <div
                                    key={c.id}
                                    className={`color-option ${c.id}`}
                                    onClick={() => handleHighlight(contextMenu.verseId, c.id)}
                                    title={c.label}
                                />
                            ))}
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
                        <button
                            type="button"
                            className="commentary-toggle"
                            aria-pressed={commentaryOpen}
                            title="Matthew Henry's Concise Commentary"
                            onClick={onToggleCommentary}
                        >
                            Commentary
                        </button>
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

                {selectedVerses.length > 0 && (
                    <div className="selection-toolbar" role="toolbar" aria-label="Selected verses">
                        <span className="selection-count">
                            {selectedVerses.length} verse{selectedVerses.length === 1 ? '' : 's'} selected
                        </span>
                        <div className="selection-colors">
                            {HIGHLIGHT_COLORS.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    className={`color-option ${c.id}`}
                                    title={`Highlight selected in ${c.label}`}
                                    aria-label={`Highlight selected in ${c.label}`}
                                    disabled={selectionBusy}
                                    onClick={() => void handleHighlightSelected(c.id)}
                                />
                            ))}
                        </div>
                        <button type="button" className="selection-btn selection-copy-btn" onClick={() => void handleCopySelected()}>
                            Copy
                        </button>
                        <button type="button" className="selection-btn selection-study-btn" onClick={() => void openStudyPicker()}>
                            Add to study
                        </button>
                        <button type="button" className="selection-btn selection-clear-btn" onClick={clearSelection}>
                            Clear
                        </button>
                        {studyPicker && (
                            <div className="study-picker">
                                <select
                                    className="study-picker-select"
                                    aria-label="Study"
                                    value={studyPicker.choice}
                                    onChange={(e) => setStudyPicker({ ...studyPicker, choice: e.target.value })}
                                >
                                    {studyPicker.studies.map((s) => (
                                        <option key={s.id} value={String(s.id)}>{s.name}</option>
                                    ))}
                                    <option value="new">New study…</option>
                                </select>
                                {studyPicker.choice === 'new' && (
                                    <input
                                        className="study-picker-name"
                                        value={studyPicker.newName}
                                        maxLength={100}
                                        placeholder="Study name"
                                        aria-label="New study name"
                                        onChange={(e) => setStudyPicker({ ...studyPicker, newName: e.target.value })}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') void handleAddSelectionToStudy();
                                        }}
                                        autoFocus
                                    />
                                )}
                                <button
                                    type="button"
                                    className="selection-btn study-picker-add"
                                    disabled={selectionBusy || (studyPicker.choice === 'new' && !studyPicker.newName.trim())}
                                    onClick={() => void handleAddSelectionToStudy()}
                                >
                                    Add
                                </button>
                                <button type="button" className="selection-btn study-picker-cancel" onClick={() => setStudyPicker(null)}>
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                )}

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

            {commentaryOpen && (
                <aside className="commentary-panel" aria-label="Commentary">
                    <h2 className="commentary-heading">Matthew Henry's Concise Commentary</h2>
                    <h3 className="commentary-subheading">{selectedBook?.name} {selectedChapter}</h3>
                    <p className="commentary-caption">Notes follow King James verse numbers.</p>
                    {commentaryError ? (
                        <p className="commentary-unavailable">{commentaryError}</p>
                    ) : commentary && commentary.key === commentaryKey ? (
                        commentaryNotes.length === 0 ? (
                            <p className="commentary-empty">No commentary for this chapter.</p>
                        ) : (
                            commentaryNotes.map((note) => (
                                <section
                                    key={note.verseStart}
                                    ref={(el) => {
                                        if (el) noteRefs.current.set(note.verseStart, el);
                                        else noteRefs.current.delete(note.verseStart);
                                    }}
                                    className={'commentary-note' + (activeNote === note ? ' active' : '')}
                                    aria-label={note.verseStart === note.verseEnd
                                        ? `Verse ${note.verseStart}`
                                        : `Verses ${note.verseStart}-${note.verseEnd}`}
                                >
                                    {renderSafeHtml(note.html)}
                                </section>
                            ))
                        )
                    ) : (
                        <p className="commentary-loading">Loading…</p>
                    )}
                </aside>
            )}
        </div>
    );
}
