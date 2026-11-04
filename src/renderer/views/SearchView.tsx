import { useState, useEffect } from 'react';
import './SearchView.css';
import { NavigationTarget } from '../App';
import { BookLike, buildBookLookup, formatReference, parseReference } from '../lib/reference';
import { loadLastRead } from '../lib/storage';

interface Verse {
    id: number;
    book_code: string;
    book_name: string;
    chapter: number;
    verse: number;
    text: string;
    book_id?: number; // Added optional book ID
}

interface SearchViewProps {
    onNavigateToBible: (target: NavigationTarget) => void;
    onError?: (message: string) => void;
}

// Helper to map book codes or names to IDs if not returned by search
// In a real app the search query should return book_id
// For now, let's use a quick map or assume strict return from API
// Actually better, let's update setSearch logic in database.ts if possible, but 
// for now let's reuse the one from ReadingPlans for simplicity or just rely on book name matching in BibleView if we refactor it.
// Wait, BibleView expects ID.
// Let's create a minimal map here too or importing it would be better.
// For safety, let's ask Electron for the book ID or search returns it.

interface Translation {
    id: number;
    code: string;
    name: string;
}

export default function SearchView({ onNavigateToBible, onError }: SearchViewProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Verse[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
    const [translations, setTranslations] = useState<Translation[]>([]);
    const [translationId, setTranslationId] = useState<number>(0);
    const [bookLookup, setBookLookup] = useState<Map<string, BookLike>>(new Map());
    const [refMessage, setRefMessage] = useState<string | null>(null);

    useEffect(() => {
        window.electronAPI.getBooks()
            .then((books) => setBookLookup(buildBookLookup(books)))
            .catch(() => onError?.('Could not load books.'));
    }, []);

    // A typed Bible reference (book + chapter) is a jump, not a text search.
    const reference = parseReference(query, bookLookup);

    useEffect(() => setRefMessage(null), [query, translationId]);

    const goToReference = async () => {
        if (!reference || translationId === 0) return;
        try {
            const { book, chapter } = reference;
            const chapterCount = await window.electronAPI.getChapterCount(book.id, translationId);
            if (chapter < 1 || chapter > chapterCount) {
                setRefMessage(`${book.name} has ${chapterCount} chapter${chapterCount === 1 ? '' : 's'}, so chapter ${chapter} doesn't exist.`);
                return;
            }
            let verse = reference.verse;
            let verseEnd = reference.verseEnd;
            if (verse !== undefined) {
                const chapterVerses = await window.electronAPI.getVerses(translationId, book.id, chapter);
                const last = chapterVerses.reduce((max, v) => Math.max(max, v.verse), 0);
                if (verseEnd !== undefined && verseEnd < verse) [verse, verseEnd] = [verseEnd, verse];
                if (verse < 1 || verse > last) {
                    setRefMessage(`${book.name} ${chapter} has ${last} verses, so verse ${verse} doesn't exist.`);
                    return;
                }
                if (verseEnd !== undefined) verseEnd = Math.min(verseEnd, last);
            }
            onNavigateToBible({
                bookId: book.id,
                chapter,
                translationId,
                verse,
                verseEnd: verseEnd !== undefined && verseEnd !== verse ? verseEnd : undefined,
            });
        } catch {
            onError?.('Could not open that reference.');
        }
    };

    // Load translations; default to KJV to match the Bible reader's default.
    useEffect(() => {
        window.electronAPI.getTranslations()
            .then((trans) => {
                setTranslations(trans);
                const kjv = trans.find(t => t.code.includes('KJV') || t.name.includes('King James'));
                const last = loadLastRead();
                const remembered = last && trans.find(t => t.id === last.translationId);
                setTranslationId(remembered ? remembered.id : kjv ? kjv.id : (trans[0]?.id ?? 0));
            })
            .catch(() => onError?.('Could not load translations.'));
    }, []);

    // Debounced search
    useEffect(() => {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        if (query.trim().length < 2 || translationId === 0 || reference) {
            setResults([]);
            return;
        }

        const timeout = setTimeout(async () => {
            setLoading(true);
            try {
                const verses = await window.electronAPI.searchVerses(query, translationId);
                setResults(verses);
            } catch (err) {
                console.error('Search failed:', err);
                onError?.('Search failed. Please try again.');
            }
            setLoading(false);
        }, 300);

        setSearchTimeout(timeout);

        return () => {
            if (timeout) clearTimeout(timeout);
        };
    }, [query, translationId, bookLookup]);

    const highlightMatch = (text: string, searchTerm: string) => {
        if (!searchTerm.trim()) return text;
        try {
            // Escape special regex characters to prevent crashes
            const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escaped})`, 'gi');
            const parts = text.split(regex);
            return parts.map((part, i) =>
                regex.test(part) ? <mark key={i} className="highlight">{part}</mark> : part
            );
        } catch (e) {
            return text;
        }
    };

    const handleResultClick = async (verse: Verse) => {
        try {
            const books = await window.electronAPI.getBooks();
            const book = books.find((b: any) => b.name === verse.book_name || b.code === verse.book_code);
            if (book) {
                onNavigateToBible({
                    bookId: book.id,
                    chapter: verse.chapter,
                    // Open the reader in the same translation the result came from.
                    translationId: translationId || undefined,
                });
            }
        } catch {
            onError?.('Could not open this verse in Bible view.');
        }
    };

    return (
        <div className="search-view">
            <div className="search-header">
                <h1 className="search-title">Search Scripture</h1>
                <div className="search-controls">
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search for words, phrases, or verses..."
                        aria-label="Search scripture"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && reference) {
                                e.preventDefault();
                                void goToReference();
                            }
                        }}
                        autoFocus
                    />
                    <select
                        className="search-translation-select"
                        aria-label="Translation to search"
                        value={translationId}
                        onChange={(e) => setTranslationId(Number(e.target.value))}
                    >
                        {translations.map((t) => (
                            <option key={t.id} value={t.id}>{t.name || t.code}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="search-results">
                {reference && (
                    <>
                        <button
                            type="button"
                            className="goto-reference"
                            aria-label={`Go to ${formatReference(reference)}`}
                            onClick={() => void goToReference()}
                        >
                            <span className="goto-label">Go to {formatReference(reference)}</span>
                            <span className="goto-hint">Enter ↵</span>
                        </button>
                        {refMessage && <p className="goto-message" role="status">{refMessage}</p>}
                    </>
                )}

                {loading && <p className="loading-text">Searching...</p>}

                {!loading && !reference && query.length >= 2 && results.length === 0 && (
                    <p className="no-results">No verses found for "{query}"</p>
                )}

                {!loading && results.length > 0 && (
                    <p className="results-count">{results.length} verses found</p>
                )}

                <ul className="results-list">
                    {results.map((verse) => (
                        <li
                            key={verse.id}
                            className="result-item"
                            onClick={() => handleResultClick(verse)}
                        >
                            <p className="result-reference">
                                {verse.book_name} {verse.chapter}:{verse.verse}
                            </p>
                            <p className="result-text">
                                {highlightMatch(verse.text, query)}
                            </p>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
