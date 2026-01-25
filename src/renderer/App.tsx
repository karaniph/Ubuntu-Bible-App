import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import DailyHome from './views/DailyHome';
import BibleView from './views/BibleView';
import SearchView from './views/SearchView';
import FavoritesView from './views/FavoritesView';
import ReadingPlans from './views/ReadingPlans';
import SettingsView from './views/SettingsView';
import './styles/app.css';
import { Topic } from '../main/preload';

export type { Topic };

type View = 'daily' | 'bible' | 'search' | 'favorites' | 'plans' | 'settings';

export interface NavigationTarget {
    bookId?: number;
    chapter?: number;
    translationId?: number;
}

export default function App() {
    const [currentView, setCurrentView] = useState<View>('daily');
    const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>('light');

    // Shared state for Bible navigation
    const [navTarget, setNavTarget] = useState<NavigationTarget | null>(null);

    const handleNavigateToBible = (target?: NavigationTarget) => {
        if (target) {
            setNavTarget(target);
        }
        setCurrentView('bible');
    };

    const renderView = () => {
        switch (currentView) {
            case 'daily':
                return <DailyHome onNavigateToBible={() => handleNavigateToBible()} />;
            case 'bible':
                return (
                    <BibleView
                        initialTarget={navTarget}
                        onTargetConsumed={() => setNavTarget(null)}
                    />
                );
            case 'search':
                return <SearchView onNavigateToBible={handleNavigateToBible} />;
            case 'favorites':
                return <FavoritesView onNavigateToBible={handleNavigateToBible} />;
            case 'plans':
                return <ReadingPlans onNavigateToBible={handleNavigateToBible} />;
            case 'settings':
                return <SettingsView theme={theme} onThemeChange={setTheme} />;
            default:
                return <DailyHome onNavigateToBible={() => handleNavigateToBible()} />;
        }
    };

    return (
        <div className={`app theme-${theme}`}>
            <Sidebar currentView={currentView} onNavigate={setCurrentView} />
            <main className="main-content">
                {renderView()}
            </main>
        </div>
    );
}
