import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import DailyHome from './views/DailyHome';
import BibleView from './views/BibleView';
import SearchView from './views/SearchView';
import ReadingPlans from './views/ReadingPlans';
import SettingsView from './views/SettingsView';
import './styles/app.css';

type View = 'daily' | 'bible' | 'search' | 'plans' | 'settings';

export default function App() {
    const [currentView, setCurrentView] = useState<View>('daily');
    const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>('light');

    const renderView = () => {
        switch (currentView) {
            case 'daily':
                return <DailyHome onNavigateToBible={() => setCurrentView('bible')} />;
            case 'bible':
                return <BibleView />;
            case 'search':
                return <SearchView onNavigateToBible={() => setCurrentView('bible')} />;
            case 'plans':
                return <ReadingPlans onNavigateToBible={() => setCurrentView('bible')} />;
            case 'settings':
                return <SettingsView theme={theme} onThemeChange={setTheme} />;
            default:
                return <DailyHome onNavigateToBible={() => setCurrentView('bible')} />;
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
