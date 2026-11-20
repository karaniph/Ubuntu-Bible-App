import { useEffect, useRef, useState } from 'react';
import './ConcordancePanel.css';
import { NavigationTarget } from '../App';
import type {
    ConcordanceLookup,
    ConcordanceVerse,
    ConcordanceWord,
    StudyDataStatus,
} from '../../main/preload';
import { stripPilcrow } from '../lib/storage';

interface ConcordancePanelProps {
    translationId: number;
    onNavigateToBible: (target: NavigationTarget) => void;
    onError?: (message: string) => void;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const COMMON_WORD = 1000;

const fmt = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

function highlightWord(text: string, word: string) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let regex: RegExp;
    try {
        regex = new RegExp('(?<![\\p{L}\\p{N}])(' + escaped + ')(?![\\p{L}\\p{N}])', 'giu');
    } catch {
        return text;
    }
    const parts = text.split(regex);
    // With one capture group, odd indexes are the matches.
    return parts.map((part, i) => (i % 2 === 1 ? <mark key={i} className="highlight">{part}</mark> : part));
}

export default function ConcordancePanel({ translationId, onNavigateToBible, onError }: ConcordancePanelProps) {
    const [status, setStatus] = useState<StudyDataStatus | null>(null);
    const [input, setInput] = useState('');
    const [filter, setFilter] = useState('');
    const [words, setWords] = useState<ConcordanceWord[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [wordsError, setWordsError] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [lookup, setLookup] = useState<ConcordanceLookup | null>(null);
    const [counting, setCounting] = useState(false);
    const [bookId, setBookId] = useState<number | null>(null);
    const [verses, setVerses] = useState<ConcordanceVerse[]>([]);
    const [total, setTotal] = useState(0);
    const [loadingVerses, setLoadingVerses] = useState(false);
    const wordsReq = useRef(0);
    const lookupReq = useRef(0);
    const versesReq = useRef(0);

    useEffect(() => {
        let mounted = true;
        window.electronAPI.getStudyDataStatus()
            .then((s) => { if (mounted) setStatus(s); })
            .catch(() => {
                if (mounted) setStatus({ ready: false, error: "The concordance isn't available right now." });
            });
        return () => { mounted = false; };
    }, []);

    // Type-ahead: wait until typing pauses.
    useEffect(() => {
        const t = setTimeout(() => setFilter(input.trim()), 150);
        return () => clearTimeout(t);
    }, [input]);

    const loadWords = async (offset: number) => {
        if (!status?.ready || translationId === 0) return;
        const req = ++wordsReq.current;
        try {
            const result = await window.electronAPI.listConcordanceWords(translationId, filter, offset);
            if (req !== wordsReq.current) return;
            if (!result.ok) {
                setWordsError(result.error);
                if (offset === 0) {
                    setWords([]);
                    setHasMore(false);
                }
                return;
            }
            setWordsError(null);
            setWords((prev) => (offset === 0 ? result.value.words : [...prev, ...result.value.words]));
            setHasMore(result.value.hasMore);
        } catch {
            if (req === wordsReq.current) onError?.('Could not load the word list.');
        }
    };

    useEffect(() => {
        void loadWords(0);
    }, [status, translationId, filter]);

    const loadVerses = async (word: string, book: number | null, offset: number) => {
        const req = ++versesReq.current;
        setLoadingVerses(true);
        try {
            const result = await window.electronAPI.getConcordanceVerses(translationId, word, book, offset);
            if (req !== versesReq.current) return;
            if (!result.ok) {
                if (result.error !== 'cancelled') onError?.(result.error);
                return;
            }
            setVerses((prev) => (offset === 0 ? result.value.verses : [...prev, ...result.value.verses]));
            setTotal(result.value.total);
        } catch {
            if (req === versesReq.current) onError?.('Could not load the verses.');
        } finally {
            if (req === versesReq.current) setLoadingVerses(false);
        }
    };

    // Look the selected word up again whenever it or the translation changes.
    useEffect(() => {
        if (!selected || !status?.ready || translationId === 0) return;
        const req = ++lookupReq.current;
        versesReq.current += 1; // drop verse pages of the previous word
        setCounting(true);
        setLookup(null);
        setVerses([]);
        setTotal(0);
        setBookId(null);
        setLoadingVerses(false);
        window.electronAPI.lookupConcordance(translationId, selected)
            .then((result) => {
                if (req !== lookupReq.current) return;
                if (!result.ok) {
                    if (result.error !== 'cancelled') onError?.(result.error);
                    return;
                }
                setLookup(result.value);
                if (result.value.verseCount > 0) void loadVerses(selected, null, 0);
            })
            .catch(() => {
                if (req === lookupReq.current) onError?.('Could not search the concordance.');
            })
            .finally(() => {
                if (req === lookupReq.current) setCounting(false);
            });
    }, [selected, translationId, status]);

    const chooseBook = (id: number | null) => {
        if (!selected || id === bookId) return;
        setBookId(id);
        setVerses([]);
        setTotal(0);
        void loadVerses(selected, id, 0);
    };

    const chooseLetter = (letter: string) => {
        const value = letter.toLowerCase();
        setInput(value);
        setFilter(value);
    };

    if (status && !status.ready) {
        return <p className="concordance-unavailable">{status.error}</p>;
    }

    return (
        <div className="concordance">
            <div className="concordance-words">
                <div className="concordance-letters" aria-label="Words starting with">
                    {LETTERS.map((l) => (
                        <button
                            key={l}
                            type="button"
                            className={`concordance-letter${filter === l.toLowerCase() ? ' active' : ''}`}
                            onClick={() => chooseLetter(l)}
                        >
                            {l}
                        </button>
                    ))}
                </div>
                <input
                    type="text"
                    className="concordance-word-input"
                    placeholder="Type a word"
                    aria-label="Find a word"
                    maxLength={40}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && words.length > 0) {
                            e.preventDefault();
                            setSelected(words[0].word);
                        }
                    }}
                />
                {wordsError && <p className="concordance-hint">{wordsError}</p>}
                <ul className="concordance-word-list">
                    {words.map((w) => (
                        <li key={w.word}>
                            <button
                                type="button"
                                className={`concordance-word-item${selected === w.word ? ' active' : ''}`}
                                onClick={() => setSelected(w.word)}
                            >
                                <span className="concordance-word">{w.word}</span>
                                <span className="concordance-word-count">{fmt(w.verse_count)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
                {!wordsError && words.length === 0 && status?.ready && (
                    <p className="concordance-hint">No words start with “{filter}”.</p>
                )}
                {hasMore && (
                    <button type="button" className="concordance-more-words" onClick={() => void loadWords(words.length)}>
                        More words
                    </button>
                )}
            </div>

            <div className="concordance-results">
                {!selected && <p className="concordance-hint">Choose a word to see every verse it appears in.</p>}
                {selected && counting && <p className="loading-text">Counting…</p>}
                {selected && lookup && !counting && (
                    <>
                        {lookup.verseCount === 0 ? (
                            <p className="concordance-summary">“{lookup.word}” doesn't appear in this translation.</p>
                        ) : (
                            <p className="concordance-summary">
                                “{lookup.word}” appears in {plural(lookup.verseCount, 'verse', 'verses')}
                                {lookup.occurrenceCount !== null ? ` (${plural(lookup.occurrenceCount, 'time', 'times')})` : ''}
                                {' '}in {plural(lookup.books.length, 'book', 'books')}
                            </p>
                        )}
                        {lookup.verseCount >= COMMON_WORD && (
                            <p className="concordance-common-warning">
                                “{lookup.word}” is a very common word. Verses are shown 100 at a time.
                            </p>
                        )}
                        {lookup.books.length > 0 && (
                            <div className="concordance-books" aria-label="Filter by book">
                                <button
                                    type="button"
                                    className={`concordance-book${bookId === null ? ' active' : ''}`}
                                    onClick={() => chooseBook(null)}
                                >
                                    All books ({fmt(lookup.verseCount)})
                                </button>
                                {lookup.books.map((b) => (
                                    <button
                                        key={b.bookId}
                                        type="button"
                                        className={`concordance-book${bookId === b.bookId ? ' active' : ''}`}
                                        onClick={() => chooseBook(b.bookId)}
                                    >
                                        {b.bookName} {fmt(b.verseCount)}
                                    </button>
                                ))}
                            </div>
                        )}
                        <ul className="concordance-verse-list">
                            {verses.map((v) => (
                                <li key={v.id}>
                                    <button
                                        type="button"
                                        className="concordance-verse"
                                        onClick={() => onNavigateToBible({
                                            bookId: v.bookId,
                                            chapter: v.chapter,
                                            translationId,
                                            verse: v.verse,
                                        })}
                                    >
                                        <span className="concordance-verse-ref">{v.bookName} {v.chapter}:{v.verse}</span>
                                        <span className="concordance-verse-text">{highlightWord(stripPilcrow(v.text), lookup.word)}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {loadingVerses && <p className="loading-text">Loading verses…</p>}
                        {!loadingVerses && verses.length < total && (
                            <button
                                type="button"
                                className="concordance-more"
                                onClick={() => selected && void loadVerses(selected, bookId, verses.length)}
                            >
                                Show more verses
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
