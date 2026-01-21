import React, { useState, useEffect } from 'react';
import './DailyHome.css';

interface DailyHomeProps {
    onNavigateToBible: () => void;
}

// Curated daily verses
const DAILY_VERSES = [
    { ref: 'Psalm 23:1', text: 'The LORD is my shepherd; I shall not want.' },
    { ref: 'Psalm 46:10', text: 'Be still, and know that I am God.' },
    { ref: 'Proverbs 3:5-6', text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding. In all thy ways acknowledge him, and he shall direct thy paths.' },
    { ref: 'Isaiah 40:31', text: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.' },
    { ref: 'Jeremiah 29:11', text: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.' },
    { ref: 'Matthew 11:28', text: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.' },
    { ref: 'John 3:16', text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
    { ref: 'Romans 8:28', text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.' },
    { ref: 'Philippians 4:13', text: 'I can do all things through Christ which strengtheneth me.' },
    { ref: 'Philippians 4:6-7', text: 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God. And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.' },
];

const PROMPTS = [
    'What is God speaking to your heart today?',
    'How does this verse apply to your life right now?',
    'Take a moment to reflect on these words...',
    'What truth stands out to you?',
    'How can you live this out today?',
];

export default function DailyHome({ onNavigateToBible }: DailyHomeProps) {
    const [dailyVerse, setDailyVerse] = useState(DAILY_VERSES[0]);
    const [prompt, setPrompt] = useState(PROMPTS[0]);
    const [reflection, setReflection] = useState('');
    const [showReflection, setShowReflection] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        // Select verse based on day of year
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
        setDailyVerse(DAILY_VERSES[dayOfYear % DAILY_VERSES.length]);
        setPrompt(PROMPTS[dayOfYear % PROMPTS.length]);
    }, []);

    const handleSave = () => {
        // Save to localStorage for now
        const saved = JSON.parse(localStorage.getItem('reflections') || '[]');
        saved.push({
            date: new Date().toISOString(),
            verse: dailyVerse.ref,
            text: reflection,
        });
        localStorage.setItem('reflections', JSON.stringify(saved));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="daily-home">
            <div className="daily-content">
                <span className="cross-symbol">✝</span>

                <blockquote className="daily-verse">
                    "{dailyVerse.text}"
                </blockquote>

                <p className="verse-reference">— {dailyVerse.ref}</p>

                <div className="reflection-section">
                    <p className="reflection-prompt">{prompt}</p>

                    {!showReflection ? (
                        <button
                            className="begin-button"
                            onClick={() => setShowReflection(true)}
                        >
                            Begin reflecting...
                        </button>
                    ) : (
                        <div className="reflection-input-area">
                            <textarea
                                className="reflection-textarea"
                                placeholder="Write your thoughts..."
                                value={reflection}
                                onChange={(e) => setReflection(e.target.value)}
                                rows={4}
                            />
                            <button
                                className="save-button"
                                onClick={handleSave}
                                disabled={!reflection.trim()}
                            >
                                {saved ? 'Reflection kept ✓' : 'Keep This Reflection'}
                            </button>
                        </div>
                    )}
                </div>

                <button className="read-chapter-button" onClick={onNavigateToBible}>
                    Read Full Bible →
                </button>
            </div>
        </div>
    );
}
