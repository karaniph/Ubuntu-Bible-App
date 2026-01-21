import React, { useState, useEffect } from 'react';
import './ReadingPlans.css';
import { NavigationTarget } from '../App';

interface Plan {
    id: string;
    name: string;
    description: string;
    duration: string;
    icon: string;
    days: { book: string; chapter: number; bookId?: number }[]; // Added bookId mapping needed
}

// Map book names to IDs (simplified mapping - ideally should come from DB but static is faster for plans)
const BOOK_IDS: Record<string, number> = {
    'Genesis': 1, 'Exodus': 2, 'Leviticus': 3, 'Numbers': 4, 'Deuteronomy': 5,
    'Joshua': 6, 'Judges': 7, 'Ruth': 8, '1 Samuel': 9, '2 Samuel': 10,
    '1 Kings': 11, '2 Kings': 12, '1 Chronicles': 13, '2 Chronicles': 14,
    'Ezra': 15, 'Nehemiah': 16, 'Esther': 17, 'Job': 18, 'Psalms': 19, 'Proverbs': 20,
    'Ecclesiastes': 21, 'Song of Solomon': 22, 'Isaiah': 23, 'Jeremiah': 24,
    'Lamentations': 25, 'Ezekiel': 26, 'Daniel': 27, 'Hosea': 28, 'Joel': 29,
    'Amos': 30, 'Obadiah': 31, 'Jonah': 32, 'Micah': 33, 'Nahum': 34,
    'Habakkuk': 35, 'Zephaniah': 36, 'Haggai': 37, 'Zechariah': 38, 'Malachi': 39,
    'Matthew': 40, 'Mark': 41, 'Luke': 42, 'John': 43, 'Acts': 44,
    'Romans': 45, '1 Corinthians': 46, '2 Corinthians': 47, 'Galatians': 48,
    'Ephesians': 49, 'Philippians': 50, 'Colossians': 51, '1 Thessalonians': 52,
    '2 Thessalonians': 53, '1 Timothy': 54, '2 Timothy': 55, 'Titus': 56,
    'Philemon': 57, 'Hebrews': 58, 'James': 59, '1 Peter': 60, '2 Peter': 61,
    '1 John': 62, '2 John': 63, '3 John': 64, 'Jude': 65, 'Revelation': 66
};

const READING_PLANS: Plan[] = [
    {
        id: 'psalms-30',
        name: 'Psalms Journey',
        description: 'Explore the Psalms over 30 days',
        duration: '30 days',
        icon: '🎵',
        days: Array.from({ length: 30 }, (_, i) => ({
            book: 'Psalms',
            chapter: (i % 150) + 1,
            bookId: 19
        })),
    },
    {
        id: 'proverbs-31',
        name: 'Wisdom of Proverbs',
        description: 'One chapter of Proverbs each day',
        duration: '31 days',
        icon: '💡',
        days: Array.from({ length: 31 }, (_, i) => ({
            book: 'Proverbs',
            chapter: i + 1,
            bookId: 20
        })),
    },
    {
        id: 'gospels-40',
        name: 'Life of Jesus',
        description: 'Journey through the Gospels',
        duration: '40 days',
        icon: '✝️',
        days: [
            ...Array.from({ length: 10 }, (_, i) => ({ book: 'Matthew', chapter: i + 1, bookId: 40 })),
            ...Array.from({ length: 10 }, (_, i) => ({ book: 'Mark', chapter: i + 1, bookId: 41 })),
            ...Array.from({ length: 10 }, (_, i) => ({ book: 'Luke', chapter: i + 1, bookId: 42 })),
            ...Array.from({ length: 10 }, (_, i) => ({ book: 'John', chapter: i + 1, bookId: 43 })),
        ],
    },
];

interface ReadingPlansProps {
    onNavigateToBible: (target: NavigationTarget) => void;
}

export default function ReadingPlans({ onNavigateToBible }: ReadingPlansProps) {
    const [activePlan, setActivePlan] = useState<Plan | null>(null);
    const [progress, setProgress] = useState<Record<string, number>>({});

    // Load progress from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('readingPlanProgress');
        if (saved) {
            setProgress(JSON.parse(saved));
        }
    }, []);

    const startPlan = (plan: Plan) => {
        setActivePlan(plan);
        if (!progress[plan.id]) {
            const newProgress = { ...progress, [plan.id]: 0 };
            setProgress(newProgress);
            localStorage.setItem('readingPlanProgress', JSON.stringify(newProgress));
        }
    };

    const markComplete = (planId: string) => {
        const newDay = (progress[planId] || 0) + 1;
        const newProgress = { ...progress, [planId]: newDay };
        setProgress(newProgress);
        localStorage.setItem('readingPlanProgress', JSON.stringify(newProgress));
    };

    const handleReadNow = (bookId: number | undefined, chapter: number) => {
        if (bookId) {
            onNavigateToBible({ bookId, chapter });
        }
    };

    if (activePlan) {
        const currentDay = progress[activePlan.id] || 0;
        const todayReading = activePlan.days[currentDay];
        const isComplete = currentDay >= activePlan.days.length;

        return (
            <div className="reading-plans active-plan">
                <button className="back-button" onClick={() => setActivePlan(null)}>
                    ← Back to Plans
                </button>

                <h1 className="plan-title">{activePlan.icon} {activePlan.name}</h1>

                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: `${(currentDay / activePlan.days.length) * 100}%` }}
                    />
                </div>
                <p className="progress-text">Day {currentDay + 1} of {activePlan.days.length}</p>

                {isComplete ? (
                    <div className="completion-message">
                        <span className="completion-icon">🎉</span>
                        <h2>Congratulations!</h2>
                        <p>You've completed the {activePlan.name}!</p>
                    </div>
                ) : todayReading ? (
                    <div className="today-reading">
                        <h2>Today's Reading</h2>
                        <p className="reading-reference">{todayReading.book} {todayReading.chapter}</p>
                        <div className="reading-actions">
                            <button
                                className="read-button"
                                onClick={() => handleReadNow(todayReading.bookId, todayReading.chapter)}
                            >
                                📖 Read Now
                            </button>
                            <button className="complete-button" onClick={() => markComplete(activePlan.id)}>
                                ✓ Mark Complete
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div className="reading-plans">
            <h1 className="plans-title">📚 Reading Plans</h1>
            <p className="plans-subtitle">Choose a plan to guide your daily reading</p>

            <div className="plans-grid">
                {READING_PLANS.map((plan) => {
                    const dayProgress = progress[plan.id] || 0;
                    const percentComplete = Math.round((dayProgress / plan.days.length) * 100);

                    return (
                        <div key={plan.id} className="plan-card" onClick={() => startPlan(plan)}>
                            <span className="plan-icon">{plan.icon}</span>
                            <h3 className="plan-name">{plan.name}</h3>
                            <p className="plan-description">{plan.description}</p>
                            <p className="plan-duration">{plan.duration}</p>
                            {dayProgress > 0 && (
                                <div className="plan-progress">
                                    <div className="mini-progress-bar">
                                        <div className="mini-progress-fill" style={{ width: `${percentComplete}%` }} />
                                    </div>
                                    <span className="progress-percent">{percentComplete}%</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
