import React, { Suspense, lazy, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import DailyHome from './views/DailyHome';
import BibleView from './views/BibleView';
import SettingsView from './views/SettingsView';
import './styles/app.css';
import type { Topic } from '../main/preload';

export type { Topic };
const SearchView = lazy(() => import('./views/SearchView'));
const FavoritesView = lazy(() => import('./views/FavoritesView'));
const ReadingPlans = lazy(() => import('./views/ReadingPlans'));

type View = 'daily' | 'bible' | 'search' | 'favorites' | 'plans' | 'settings';

export interface NavigationTarget {
    bookId?: number;
    chapter?: number;
    translationId?: number;
}

export default function App() {
    const [currentView, setCurrentView] = useState<View>('daily');
    const [theme, setTheme] = useState<'light' | 'dark' | 'sepia'>('light');
    const [startupState, setStartupState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [startupError, setStartupError] = useState<string | null>(null);
    const [toasts, setToasts] = useState<Array<{ id: number; message: string }>>([]);

    // Shared state for Bible navigation
    const [navTarget, setNavTarget] = useState<NavigationTarget | null>(null);

    const showToast = (message: string) => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        setToasts((prev) => [...prev, { id, message }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 3600);
    };

    useEffect(() => {
        let mounted = true;
        window.electronAPI.waitUntilDatabaseReady()
            .then((status) => {
                if (!mounted) return;
                if (status.ready) {
                    setStartupState('ready');
                    setStartupError(null);
                    return;
                }
                setStartupState('error');
                setStartupError(status.error || 'The Bible database failed to initialize.');
            })
            .catch((err) => {
                if (!mounted) return;
                setStartupState('error');
                setStartupError(err instanceof Error ? err.message : 'Database startup check failed.');
            });
        return () => {
            mounted = false;
        };
    }, []);

    const handleNavigateToBible = (target?: NavigationTarget) => {
        if (target) {
            setNavTarget(target);
        }
        setCurrentView('bible');
    };

    const renderView = () => {
        switch (currentView) {
            case 'daily':
                return <DailyHome onNavigateToBible={() => handleNavigateToBible()} onError={showToast} />;
            case 'bible':
                return (
                    <BibleView
                        initialTarget={navTarget}
                        onTargetConsumed={() => setNavTarget(null)}
                        onError={showToast}
                    />
                );
            case 'search':
                return <SearchView onNavigateToBible={handleNavigateToBible} onError={showToast} />;
            case 'favorites':
                return <FavoritesView onNavigateToBible={handleNavigateToBible} onError={showToast} />;
            case 'plans':
                return <ReadingPlans onNavigateToBible={handleNavigateToBible} onError={showToast} />;
            case 'settings':
                return <SettingsView theme={theme} onThemeChange={setTheme} onToast={showToast} />;
            default:
                return <DailyHome onNavigateToBible={() => handleNavigateToBible()} onError={showToast} />;
        }
    };

    return (
        <div className={`app theme-${theme}`}>
            <Sidebar currentView={currentView} onNavigate={setCurrentView} />
            <main className="main-content">
                {startupState === 'loading' && (
                    <div className="startup-banner">Preparing Bible library...</div>
                )}
                {startupState === 'error' ? (
                    <div className="db-fallback">
                        <h2>Bible Library Unavailable</h2>
                        <p>{startupError || 'Database initialization failed.'}</p>
                        <p>Please restart the app. If it persists, reinstall from a fresh snap build.</p>
                    </div>
                ) : (
                    <Suspense fallback={<div className="view-loading">Loading view...</div>}>
                        {renderView()}
                    </Suspense>
                )}
                <div className="toast-stack">
                    {toasts.map((toast) => (
                        <div key={toast.id} className="toast-item">{toast.message}</div>
                    ))}
                </div>
            </main>
        </div>
    );
}
