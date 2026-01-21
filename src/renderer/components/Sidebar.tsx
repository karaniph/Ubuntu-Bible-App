import React from 'react';
import './Sidebar.css';

type View = 'daily' | 'bible' | 'search' | 'plans' | 'settings';

interface SidebarProps {
    currentView: View;
    onNavigate: (view: View) => void;
}

const navItems: { view: View; label: string; icon: string }[] = [
    { view: 'daily', label: 'Today', icon: '☀️' },
    { view: 'bible', label: 'Bible', icon: '📖' },
    { view: 'search', label: 'Search', icon: '🔍' },
    { view: 'plans', label: 'Plans', icon: '📚' },
    { view: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar({ currentView, onNavigate }: SidebarProps) {
    return (
        <nav className="sidebar">
            <div className="sidebar-header">
                <h1 className="app-title">Bible App</h1>
            </div>
            <ul className="nav-list">
                {navItems.map((item) => (
                    <li key={item.view}>
                        <button
                            className={`nav-item ${currentView === item.view ? 'active' : ''}`}
                            onClick={() => onNavigate(item.view)}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span className="nav-label">{item.label}</span>
                        </button>
                    </li>
                ))}
            </ul>
            <div className="sidebar-footer">
                <a
                    href="https://buymeacoffee.com/karaniph"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="support-link"
                >
                    ☕ Support
                </a>
            </div>
        </nav>
    );
}
