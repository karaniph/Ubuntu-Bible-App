import React, { useState, useEffect } from 'react';
import './SearchView.css';

interface Verse {
    id: number;
    book_code: string;
    book_name: string;
    chapter: number;
    verse: number;
    text: string;
}

interface SearchViewProps {
    onNavigateToBible: () => void;
}

export default function SearchView({ onNavigateToBible }: SearchViewProps) {
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
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const parts = text.split(regex);
        return parts.map((part, i) =>
            regex.test(part) ? <mark key={i} className="highlight">{part}</mark> : part
        );
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
                        <li key={verse.id} className="result-item">
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
