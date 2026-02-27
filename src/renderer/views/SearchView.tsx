import React, { useState, useEffect } from 'react';
import './SearchView.css';
import { NavigationTarget } from '../App';

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

export default function SearchView({ onNavigateToBible, onError }: SearchViewProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Verse[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

    // Debounced search
    useEffect(() => {
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }

        if (query.trim().length < 2) {
            setResults([]);
            return;
        }

        const timeout = setTimeout(async () => {
            setLoading(true);
            try {
                const verses = await window.electronAPI.searchVerses(query, 1);
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
    }, [query]);

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
                    chapter: verse.chapter
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
                <input
                    type="text"
                    className="search-input"
                    placeholder="Search for words, phrases, or verses..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                />
            </div>

            <div className="search-results">
                {loading && <p className="loading-text">Searching...</p>}

                {!loading && query.length >= 2 && results.length === 0 && (
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
