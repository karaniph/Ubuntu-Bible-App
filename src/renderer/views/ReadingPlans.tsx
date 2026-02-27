import React, { useMemo, useState, useEffect } from 'react';
import './ReadingPlans.css';
import { NavigationTarget } from '../App';

interface PlanDay {
    book: string;
    chapter: number;
    bookId?: number;
}

interface Plan {
    id: string;
    name: string;
    description: string;
    duration: string;
    icon: string;
    days: PlanDay[];
}

interface ReadingGuide {
    id: string;
    name: string;
    role: 'Major Prophet' | 'Minor Prophet' | 'King' | 'Judge' | 'Priest';
    summary: string;
    work: string;
    miracles: string;
    death: string;
    keyText: PlanDay;
    direction: string;
    sources?: string[];
    relatedPassages?: PlanDay[];
}

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
        id: 'prophets-major-18',
        name: 'Major Prophets Path',
        description: 'A focused walk through major prophet passages',
        duration: '18 days',
        icon: '📜',
        days: [
            { book: 'Isaiah', chapter: 1, bookId: 23 }, { book: 'Isaiah', chapter: 6, bookId: 23 },
            { book: 'Isaiah', chapter: 40, bookId: 23 }, { book: 'Isaiah', chapter: 53, bookId: 23 },
            { book: 'Jeremiah', chapter: 1, bookId: 24 }, { book: 'Jeremiah', chapter: 18, bookId: 24 },
            { book: 'Jeremiah', chapter: 31, bookId: 24 }, { book: 'Lamentations', chapter: 3, bookId: 25 },
            { book: 'Ezekiel', chapter: 18, bookId: 26 }, { book: 'Ezekiel', chapter: 37, bookId: 26 },
            { book: 'Daniel', chapter: 2, bookId: 27 }, { book: 'Daniel', chapter: 3, bookId: 27 },
            { book: 'Daniel', chapter: 6, bookId: 27 }, { book: 'Daniel', chapter: 7, bookId: 27 },
            { book: 'Daniel', chapter: 9, bookId: 27 }, { book: 'Daniel', chapter: 12, bookId: 27 },
            { book: 'Isaiah', chapter: 58, bookId: 23 }, { book: 'Jeremiah', chapter: 33, bookId: 24 },
        ],
    },
    {
        id: 'prophets-minor-24',
        name: 'Minor Prophets Path',
        description: 'Guided readings through all 12 minor prophets',
        duration: '24 days',
        icon: '🕯️',
        days: [
            { book: 'Hosea', chapter: 1, bookId: 28 }, { book: 'Hosea', chapter: 14, bookId: 28 },
            { book: 'Joel', chapter: 2, bookId: 29 }, { book: 'Joel', chapter: 3, bookId: 29 },
            { book: 'Amos', chapter: 5, bookId: 30 }, { book: 'Amos', chapter: 9, bookId: 30 },
            { book: 'Obadiah', chapter: 1, bookId: 31 }, { book: 'Jonah', chapter: 1, bookId: 32 },
            { book: 'Jonah', chapter: 4, bookId: 32 }, { book: 'Micah', chapter: 4, bookId: 33 },
            { book: 'Micah', chapter: 6, bookId: 33 }, { book: 'Nahum', chapter: 1, bookId: 34 },
            { book: 'Habakkuk', chapter: 2, bookId: 35 }, { book: 'Habakkuk', chapter: 3, bookId: 35 },
            { book: 'Zephaniah', chapter: 3, bookId: 36 }, { book: 'Haggai', chapter: 1, bookId: 37 },
            { book: 'Haggai', chapter: 2, bookId: 37 }, { book: 'Zechariah', chapter: 4, bookId: 38 },
            { book: 'Zechariah', chapter: 9, bookId: 38 }, { book: 'Zechariah', chapter: 14, bookId: 38 },
            { book: 'Malachi', chapter: 1, bookId: 39 }, { book: 'Malachi', chapter: 3, bookId: 39 },
            { book: 'Malachi', chapter: 4, bookId: 39 }, { book: 'Joel', chapter: 1, bookId: 29 },
        ],
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

const READING_GUIDES: ReadingGuide[] = [
    {
        id: 'isaiah', name: 'Isaiah', role: 'Major Prophet',
        summary: 'Called to confront sin and announce salvation.',
        work: 'Warned Judah, called for repentance, and foretold Messiah.',
        miracles: 'No personal miracle record; received major prophetic visions.',
        death: 'Traditionally believed martyred under Manasseh.',
        keyText: { book: 'Isaiah', chapter: 6, bookId: 23 },
        direction: 'Start at Isaiah 6, then read chapters 40 and 53 for hope and redemption.'
    },
    {
        id: 'jeremiah', name: 'Jeremiah', role: 'Major Prophet',
        summary: 'Proclaimed judgment before exile and promised a new covenant.',
        work: 'Preached in Judah for decades; urged return to God.',
        miracles: 'No direct miracle attributed to him; his preserved life in crisis is notable.',
        death: 'Likely died in Egypt after being taken there by refugees.',
        keyText: { book: 'Jeremiah', chapter: 31, bookId: 24 },
        direction: 'Read Jeremiah 1 and 31 to see both warning and covenant hope.'
    },
    {
        id: 'ezekiel', name: 'Ezekiel', role: 'Major Prophet',
        summary: 'Exilic prophet of holiness, judgment, and restoration.',
        work: 'Spoke to exiles in Babylon; called Israel to responsibility.',
        miracles: 'Saw symbolic visions like the valley of dry bones.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Ezekiel', chapter: 37, bookId: 26 },
        direction: 'Begin with Ezekiel 18 and 37 for accountability and renewal.'
    },
    {
        id: 'daniel', name: 'Daniel', role: 'Major Prophet',
        summary: 'Faithful witness in exile and interpreter of visions.',
        work: 'Served pagan kings while remaining loyal to God.',
        miracles: "Protected in lions' den; companions delivered from the furnace.",
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Daniel', chapter: 6, bookId: 27 },
        direction: 'Read Daniel 2, 6, and 9 for courage, prayer, and prophecy.'
    },
    {
        id: 'hosea', name: 'Hosea', role: 'Minor Prophet',
        summary: 'Showed covenant love through painful personal obedience.',
        work: 'Called Israel away from idolatry back to covenant faithfulness.',
        miracles: 'No miracle account attached to him personally.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Hosea', chapter: 14, bookId: 28 },
        direction: 'Read Hosea 1, 3, and 14 to track judgment to restoration.'
    },
    {
        id: 'joel', name: 'Joel', role: 'Minor Prophet',
        summary: 'Used a locust crisis to call for repentance.',
        work: "Announced the day of the LORD and promised God's Spirit.",
        miracles: 'Prophetic promise of Spirit outpouring (Joel 2).',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Joel', chapter: 2, bookId: 29 },
        direction: 'Read Joel 2 first, then chapter 3 for the larger judgment theme.'
    },
    {
        id: 'amos', name: 'Amos', role: 'Minor Prophet',
        summary: 'Shepherd-prophet who denounced injustice.',
        work: 'Confronted exploitative religion and social oppression.',
        miracles: 'No personal miracle narrative.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Amos', chapter: 5, bookId: 30 },
        direction: 'Start with Amos 5 and end at chapter 9 for restoration.'
    },
    {
        id: 'obadiah', name: 'Obadiah', role: 'Minor Prophet',
        summary: "Shortest OT prophet; judged Edom's pride.",
        work: 'Declared accountability for violence against Judah.',
        miracles: 'No personal miracle narrative.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Obadiah', chapter: 1, bookId: 31 },
        direction: 'Read Obadiah 1 and compare with Psalm 137 context.'
    },
    {
        id: 'jonah', name: 'Jonah', role: 'Minor Prophet',
        summary: 'Reluctant prophet sent to Nineveh.',
        work: 'Preached repentance to a foreign city.',
        miracles: 'Preserved by God in a great fish.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Jonah', chapter: 3, bookId: 32 },
        direction: 'Read Jonah 1 through 4 as one storyline for full impact.'
    },
    {
        id: 'micah', name: 'Micah', role: 'Minor Prophet',
        summary: 'Exposed corruption and proclaimed Messiah from Bethlehem.',
        work: 'Called leaders and people to justice, mercy, and humility.',
        miracles: 'No personal miracle narrative.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Micah', chapter: 6, bookId: 33 },
        direction: 'Read Micah 4 and 6 to balance hope and ethical calling.'
    },
    {
        id: 'nahum', name: 'Nahum', role: 'Minor Prophet',
        summary: "Announced Nineveh's downfall.",
        work: "Declared God's justice against violence and oppression.",
        miracles: 'No personal miracle narrative.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Nahum', chapter: 1, bookId: 34 },
        direction: 'Read Nahum 1 first, then chapter 3 for historical outcome.'
    },
    {
        id: 'habakkuk', name: 'Habakkuk', role: 'Minor Prophet',
        summary: 'Modeled faithful questioning before God.',
        work: 'Dialogued with God about evil and justice.',
        miracles: 'No personal miracle narrative.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Habakkuk', chapter: 3, bookId: 35 },
        direction: 'Read chapters 1 to 3 in order to follow the movement to trust.'
    },
    {
        id: 'zephaniah', name: 'Zephaniah', role: 'Minor Prophet',
        summary: 'Called Judah to seek the LORD before judgment.',
        work: 'Warned of judgment and promised restoration for the humble.',
        miracles: 'No personal miracle narrative.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Zephaniah', chapter: 3, bookId: 36 },
        direction: 'Begin with chapter 1 for warning and chapter 3 for restoration.'
    },
    {
        id: 'haggai', name: 'Haggai', role: 'Minor Prophet',
        summary: 'Urged returned exiles to rebuild the temple.',
        work: "Re-centered priorities on God's house and mission.",
        miracles: 'No personal miracle narrative.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Haggai', chapter: 1, bookId: 37 },
        direction: 'Read both chapters together for the full exhortation.'
    },
    {
        id: 'zechariah', name: 'Zechariah', role: 'Minor Prophet',
        summary: 'Visionary prophet of hope and coming king.',
        work: 'Encouraged temple rebuilding and future messianic hope.',
        miracles: 'Received symbolic night visions.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Zechariah', chapter: 9, bookId: 38 },
        direction: 'Read chapters 4 and 9 to track present work and future hope.'
    },
    {
        id: 'malachi', name: 'Malachi', role: 'Minor Prophet',
        summary: 'Final OT prophetic voice calling for covenant faithfulness.',
        work: 'Rebuked empty worship and promised coming messenger.',
        miracles: 'No personal miracle narrative.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Malachi', chapter: 3, bookId: 39 },
        direction: 'Read Malachi 1, 3, and 4 to capture the full message arc.'
    },
    {
        id: 'david', name: 'David', role: 'King',
        summary: "Shepherd-king after God's heart.",
        work: 'Unified Israel and established Jerusalem as royal center.',
        miracles: 'Defeated Goliath; experienced repeated divine deliverance.',
        death: 'Died in Jerusalem after appointing Solomon (1 Kings 2).',
        keyText: { book: '2 Samuel', chapter: 7, bookId: 10 },
        direction: 'Start with 1 Samuel 17, then 2 Samuel 7 for covenant context.'
    },
    {
        id: 'solomon', name: 'Solomon', role: 'King',
        summary: 'Wise king who built the first temple.',
        work: 'Led Israel at peak prosperity and temple worship.',
        miracles: 'Gifted extraordinary wisdom by God.',
        death: 'Died after a long reign; kingdom later divided.',
        keyText: { book: '1 Kings', chapter: 3, bookId: 11 },
        direction: 'Read 1 Kings 3 and 8, then 11 for lessons on endurance.'
    },
    {
        id: 'hezekiah', name: 'Hezekiah', role: 'King',
        summary: 'Reforming king who trusted God in crisis.',
        work: 'Removed idols and restored temple worship.',
        miracles: 'God delivered Jerusalem and extended his life.',
        death: 'Died and was buried with honor in Jerusalem.',
        keyText: { book: '2 Kings', chapter: 19, bookId: 12 },
        direction: 'Read 2 Kings 18 to 20 for reform, pressure, and prayer.'
    },
    {
        id: 'josiah', name: 'Josiah', role: 'King',
        summary: 'Young reformer king renewed covenant obedience.',
        work: 'Led major reform after discovering the book of the law.',
        miracles: 'No personal miracle narrative; reform itself was sweeping.',
        death: 'Killed in battle at Megiddo.',
        keyText: { book: '2 Kings', chapter: 22, bookId: 12 },
        direction: 'Read 2 Kings 22 and 23 for model reform leadership.'
    },
    {
        id: 'deborah', name: 'Deborah', role: 'Judge',
        summary: 'Prophetess and judge who led Israel to victory.',
        work: 'Judged Israel and directed Barak against Sisera.',
        miracles: 'Victory involved remarkable providential intervention.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Judges', chapter: 4, bookId: 7 },
        direction: 'Read Judges 4 and 5 together for event and song theology.'
    },
    {
        id: 'gideon', name: 'Gideon', role: 'Judge',
        summary: 'Fearful man transformed for bold obedience.',
        work: 'Delivered Israel from Midian with a small force.',
        miracles: 'Sign of fleece and triumph with 300 men.',
        death: 'Died at good old age in Ophrah.',
        keyText: { book: 'Judges', chapter: 7, bookId: 7 },
        direction: 'Read Judges 6 to 8, watching faith growth and later compromise.'
    },
    {
        id: 'samson', name: 'Samson', role: 'Judge',
        summary: 'Nazirite judge with great strength and deep flaws.',
        work: 'Fought Philistine oppression over many years.',
        miracles: 'Spirit-enabled feats of strength.',
        death: "Died in Gaza collapsing Dagon's temple.",
        keyText: { book: 'Judges', chapter: 16, bookId: 7 },
        direction: 'Read Judges 13 to 16 for calling, failure, and final faith.'
    },
    {
        id: 'samuel', name: 'Samuel', role: 'Judge',
        summary: 'Last judge and key transition leader to monarchy.',
        work: 'Judged Israel, trained leaders, and anointed kings.',
        miracles: 'God answered his prayer in visible ways.',
        death: 'Died and was mourned by all Israel.',
        keyText: { book: '1 Samuel', chapter: 7, bookId: 9 },
        direction: 'Read 1 Samuel 3, 7, and 12 for prophetic leadership patterns.'
    },
    {
        id: 'aaron', name: 'Aaron', role: 'Priest',
        summary: "First high priest of Israel and Moses' brother.",
        work: 'Led priestly ministry and sacrificial worship.',
        miracles: 'Rod signs and confirmed priestly calling.',
        death: 'Died on Mount Hor; priesthood passed to Eleazar.',
        keyText: { book: 'Leviticus', chapter: 16, bookId: 3 },
        direction: 'Read Exodus 28 and Leviticus 16 for priestly framework.'
    },
    {
        id: 'eli', name: 'Eli', role: 'Priest',
        summary: "Priest at Shiloh during Israel's instability.",
        work: 'Oversaw sanctuary and mentored young Samuel.',
        miracles: 'No personal miracle narrative.',
        death: 'Died after hearing the ark was captured.',
        keyText: { book: '1 Samuel', chapter: 3, bookId: 9 },
        direction: 'Read 1 Samuel 2 to 4 for leadership lessons and warnings.'
    },
    {
        id: 'ezra', name: 'Ezra', role: 'Priest',
        summary: 'Priest-scribe who restored covenant teaching.',
        work: 'Re-established Torah-centered life after exile.',
        miracles: 'No personal miracle narrative; preservation and favor noted.',
        death: 'Death is not explicitly recorded in Scripture.',
        keyText: { book: 'Ezra', chapter: 7, bookId: 15 },
        direction: 'Read Ezra 7 to 10 for word-centered spiritual renewal.'
    },
];

interface ReadingPlansProps {
    onNavigateToBible: (target: NavigationTarget) => void;
    onError?: (message: string) => void;
}

type PlanProgressState = Record<string, { currentDay: number; completedByDay: Record<number, string> }>;

const PLAN_PROGRESS_KEY = 'readingPlanProgressV2';
const PLAN_ACTIVE_KEY = 'readingPlanActive';
const ROLE_SOURCE_DEFAULTS: Record<ReadingGuide['role'], string[]> = {
    'Major Prophet': ['2 Kings 17-25 (historical context)'],
    'Minor Prophet': ['2 Kings 14-25 (historical context)'],
    'King': ['1-2 Samuel; 1-2 Kings; 1-2 Chronicles'],
    'Judge': ['Judges 1-21'],
    'Priest': ['Exodus 28-30; Leviticus 8-10'],
};

function migrateLegacyPlanProgress(): PlanProgressState {
    const legacyRaw = localStorage.getItem('readingPlanProgress');
    if (!legacyRaw) return {};
    try {
        const parsed = JSON.parse(legacyRaw) as Record<string, number>;
        const migrated: PlanProgressState = {};
        for (const [planId, day] of Object.entries(parsed)) {
            migrated[planId] = {
                currentDay: Number.isFinite(day) ? Math.max(0, day) : 0,
                completedByDay: {},
            };
        }
        return migrated;
    } catch {
        return {};
    }
}

export default function ReadingPlans({ onNavigateToBible, onError }: ReadingPlansProps) {
    const [activePlan, setActivePlan] = useState<Plan | null>(null);
    const [progress, setProgress] = useState<PlanProgressState>({});
    const [guideFilter, setGuideFilter] = useState<ReadingGuide['role'] | 'All'>('All');
    const [guideQuery, setGuideQuery] = useState('');

    useEffect(() => {
        const saved = localStorage.getItem(PLAN_PROGRESS_KEY);
        if (saved) {
            try {
                setProgress(JSON.parse(saved));
            } catch {
                setProgress({});
            }
            return;
        }
        const migrated = migrateLegacyPlanProgress();
        setProgress(migrated);
        localStorage.setItem(PLAN_PROGRESS_KEY, JSON.stringify(migrated));
    }, []);

    useEffect(() => {
        localStorage.setItem(PLAN_PROGRESS_KEY, JSON.stringify(progress));
    }, [progress]);

    useEffect(() => {
        const activePlanId = localStorage.getItem(PLAN_ACTIVE_KEY);
        if (!activePlanId) return;
        const plan = READING_PLANS.find((p) => p.id === activePlanId);
        if (plan) setActivePlan(plan);
    }, []);

    const guideRoles = useMemo(() => ['All', ...Array.from(new Set(READING_GUIDES.map((g) => g.role)))], []);

    const visibleGuides = useMemo(() => {
        const query = guideQuery.trim().toLowerCase();
        return READING_GUIDES.filter((guide) => {
            const matchesFilter = guideFilter === 'All' || guide.role === guideFilter;
            if (!matchesFilter) return false;
            if (!query) return true;
            return (
                guide.name.toLowerCase().includes(query) ||
                guide.role.toLowerCase().includes(query) ||
                guide.summary.toLowerCase().includes(query) ||
                guide.work.toLowerCase().includes(query) ||
                guide.direction.toLowerCase().includes(query)
            );
        });
    }, [guideFilter, guideQuery]);

    const startPlan = (plan: Plan) => {
        setActivePlan(plan);
        localStorage.setItem(PLAN_ACTIVE_KEY, plan.id);
        setProgress((prev) => {
            if (prev[plan.id]) return prev;
            return {
                ...prev,
                [plan.id]: { currentDay: 0, completedByDay: {} },
            };
        });
    };

    const markComplete = (planId: string) => {
        setProgress((prev) => {
            const current = prev[planId] || { currentDay: 0, completedByDay: {} };
            const planLength = READING_PLANS.find((p) => p.id === planId)?.days.length ?? current.currentDay;
            if (current.currentDay >= planLength) return prev;
            const completedDay = current.currentDay;
            return {
                ...prev,
                [planId]: {
                    currentDay: Math.min(current.currentDay + 1, planLength),
                    completedByDay: {
                        ...current.completedByDay,
                        [completedDay]: new Date().toISOString(),
                    },
                },
            };
        });
    };

    const resetPlan = (planId: string) => {
        setProgress((prev) => ({
            ...prev,
            [planId]: { currentDay: 0, completedByDay: {} },
        }));
    };

    const handleReadNow = (bookId: number | undefined, chapter: number) => {
        if (bookId) {
            onNavigateToBible({ bookId, chapter });
        } else {
            onError?.('Could not locate this passage in Bible view.');
        }
    };

    const getPlanProgress = (planId: string) => progress[planId] || { currentDay: 0, completedByDay: {} };

    if (activePlan) {
        const activeProgress = getPlanProgress(activePlan.id);
        const currentDay = activeProgress.currentDay;
        const todayReading = activePlan.days[currentDay];
        const isComplete = currentDay >= activePlan.days.length;

        return (
            <div className="reading-plans active-plan">
                <button className="back-button" onClick={() => {
                    setActivePlan(null);
                    localStorage.removeItem(PLAN_ACTIVE_KEY);
                }}>
                    ← Back to Plans
                </button>

                <h1 className="plan-title">{activePlan.icon} {activePlan.name}</h1>

                <div className="progress-bar">
                    <div
                        className="progress-fill"
                        style={{ width: `${(currentDay / activePlan.days.length) * 100}%` }}
                    />
                </div>
                <p className="progress-text">Day {Math.min(currentDay + 1, activePlan.days.length)} of {activePlan.days.length}</p>

                {isComplete ? (
                    <div className="completion-message">
                        <span className="completion-icon">🎉</span>
                        <h2>Congratulations!</h2>
                        <p>You've completed the {activePlan.name}!</p>
                        <button className="complete-button" onClick={() => resetPlan(activePlan.id)}>
                            Reset Plan
                        </button>
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
                                Read Now
                            </button>
                            <button className="complete-button" onClick={() => markComplete(activePlan.id)}>
                                Mark Complete
                            </button>
                            <button className="complete-button" onClick={() => resetPlan(activePlan.id)}>
                                Reset Plan
                            </button>
                        </div>
                    </div>
                ) : null}

                <section className="completion-log">
                    <h3>Completion Log</h3>
                    {Object.entries(activeProgress.completedByDay).length === 0 ? (
                        <p>No completed days yet.</p>
                    ) : (
                        <ul>
                            {Object.entries(activeProgress.completedByDay)
                                .sort((a, b) => Number(a[0]) - Number(b[0]))
                                .map(([dayIndex, date]) => (
                                    <li key={dayIndex}>
                                        Day {Number(dayIndex) + 1} completed on {new Date(date).toLocaleDateString()}
                                    </li>
                                ))}
                        </ul>
                    )}
                </section>
            </div>
        );
    }

    return (
        <div className="reading-plans">
            <h1 className="plans-title">Reading Plans</h1>
            <p className="plans-subtitle">Choose a plan, or search character guides for clear direction.</p>

            <div className="plans-grid">
                {READING_PLANS.map((plan) => {
                    const dayProgress = getPlanProgress(plan.id).currentDay;
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

            <section className="guides-section">
                <div className="guides-header">
                    <h2>Prophets, Kings, Judges and Priests</h2>
                    <p>Each guide includes work, miracles (if any), death, and where to start reading.</p>
                </div>

                <div className="guides-controls">
                    <input
                        className="guides-search"
                        value={guideQuery}
                        onChange={(e) => setGuideQuery(e.target.value)}
                        placeholder="Find by name, role, theme or guidance..."
                    />
                    <div className="guides-filters">
                        {guideRoles.map((role) => (
                            <button
                                key={role}
                                className={`filter-button ${guideFilter === role ? 'active' : ''}`}
                                onClick={() => setGuideFilter(role as ReadingGuide['role'] | 'All')}
                            >
                                {role}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="guides-grid">
                    {visibleGuides.map((guide) => {
                        const bookId = guide.keyText.bookId ?? BOOK_IDS[guide.keyText.book];
                        const sourceRefs = guide.sources?.length
                            ? guide.sources
                            : [
                                `Primary text: ${guide.keyText.book} ${guide.keyText.chapter}`,
                                ...ROLE_SOURCE_DEFAULTS[guide.role],
                            ];
                        const relatedPassages = guide.relatedPassages?.length
                            ? guide.relatedPassages
                            : [
                                guide.keyText,
                                {
                                    book: guide.keyText.book,
                                    chapter: guide.keyText.chapter > 1 ? guide.keyText.chapter - 1 : guide.keyText.chapter + 1,
                                    bookId,
                                },
                            ];
                        return (
                            <article key={guide.id} className="guide-card">
                                <div className="guide-meta">
                                    <span className="guide-role">{guide.role}</span>
                                    <h3>{guide.name}</h3>
                                </div>
                                <p className="guide-summary">{guide.summary}</p>
                                <p><strong>Work:</strong> {guide.work}</p>
                                <p><strong>Miracles:</strong> {guide.miracles}</p>
                                <p><strong>Death:</strong> {guide.death}</p>
                                <p><strong>Direction:</strong> {guide.direction}</p>
                                <p><strong>Sources:</strong> {sourceRefs.join(' | ')}</p>
                                <div className="related-passages">
                                    <strong>Related Passages:</strong>
                                    <div className="passage-chips">
                                        {relatedPassages.map((passage, idx) => (
                                            <button
                                                key={`${guide.id}-${passage.book}-${passage.chapter}-${idx}`}
                                                className="passage-chip"
                                                onClick={() => handleReadNow(passage.bookId ?? BOOK_IDS[passage.book], passage.chapter)}
                                            >
                                                {passage.book} {passage.chapter}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="guide-actions">
                                    <button onClick={() => handleReadNow(bookId, guide.keyText.chapter)}>
                                        Read Key Text: {guide.keyText.book} {guide.keyText.chapter}
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>
                {visibleGuides.length === 0 && (
                    <p className="guides-empty">No results found. Try a broader keyword or switch filter.</p>
                )}
            </section>
        </div>
    );
}
