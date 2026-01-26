import React, { useState, useEffect } from 'react';
import './FavoritesView.css';

interface Highlight {
    id: number;
    verse_id: number;
    color: string;
    topic_id?: number;
    topic_name?: string;
    text: string;
    chapter: number;
    verse: number;
    book_id: number;
    book_name: string;
    book_code: string;
}

interface Topic {
    id: number;
    name: string;
    color?: string;
}

interface FavoritesViewProps {
    onNavigateToBible: (target: { bookId: number; chapter: number }) => void;
}

export default function FavoritesView({ onNavigateToBible }: FavoritesViewProps) {
    const [highlights, setHighlights] = useState<Highlight[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterTopicId, setFilterTopicId] = useState<number | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        async function loadData() {
            try {
                const [h, t] = await Promise.all([
                    window.electronAPI.getHighlights(),
                    window.electronAPI.getTopics()
                ]);
                setHighlights(h);
                setTopics(t);
                setLoading(false);
            } catch (err) {
                console.error('Failed to load favorites:', err);
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const filteredHighlights = highlights.filter(h => {
        const matchesTopic = filterTopicId === 'all' || h.topic_id === filterTopicId;
        const matchesSearch = !searchQuery.trim() ||
            (h.topic_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (h.text.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesTopic && matchesSearch;
    });

    if (loading) return <div className="favorites-view loading">Loading your favorites...</div>;

    return (
        <div className="favorites-view">
            <header className="view-header">
                <h1 className="view-title">Favorites & Topics 📚</h1>
                <div className="filter-bar">
                    <div className="search-wrapper">
                        <span className="search-icon">🔍</span>
                        <input
                            type="text"
                            placeholder="Search verses or categories..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="favorites-search-input"
                        />
                    </div>
                    <select
                        value={filterTopicId}
                        onChange={(e) => setFilterTopicId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        className="topic-select"
                    >
                        <option value="all">All Topics</option>
                        {topics.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>
            </header>

            <div className="favorites-list">
                {filteredHighlights.length === 0 ? (
                    <div className="empty-state">
                        <p>No tagged verses found. Start reading to save your favorites!</p>
                    </div>
                ) : (
                    filteredHighlights.map(h => (
                        <div
                            key={h.id}
                            className={`favorite-card highlight-${h.color}`}
                            onClick={() => onNavigateToBible({ bookId: h.book_id, chapter: h.chapter })}
                        >
                            <div className="card-meta">
                                <span className="reference">{h.book_name} {h.chapter}:{h.verse}</span>
                                {h.topic_name && <span className="topic-badge">{h.topic_name}</span>}
                            </div>
                            <p className="verse-preview">"{h.text}"</p>
                            <div className="card-footer">
                                <span className="jump-link">Jump to chapter →</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
