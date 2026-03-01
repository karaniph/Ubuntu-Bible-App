import React from 'react';
import './SettingsView.css'; interface SettingsViewProps {
    theme: 'light' | 'dark' | 'sepia';
    onThemeChange: (theme: 'light' | 'dark' | 'sepia') => void;
    onToast?: (message: string) => void;
}

const themes = [
    { id: 'light', label: 'Light', icon: '☀️' },
    { id: 'dark', label: 'Dark', icon: '🌙' },
    { id: 'sepia', label: 'Sepia', icon: '📜' },
] as const;

export default function SettingsView({ theme, onThemeChange, onToast }: SettingsViewProps) {
    return (
        <div className="settings-view">
            <h1 className="settings-title">Settings</h1>

            <section className="settings-section">
                <h2 className="section-title">Appearance</h2>

                <div className="setting-row">
                    <span className="setting-label">Theme</span>
                    <div className="theme-buttons">
                        {themes.map((t) => (
                            <button
                                key={t.id}
                                className={`theme-button ${theme === t.id ? 'active' : ''}`}
                                onClick={() => onThemeChange(t.id)}
                            >
                                <span className="theme-icon">{t.icon}</span>
                                <span className="theme-label">{t.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <section className="settings-section">
                <h2 className="section-title">About</h2>

                <div className="about-info">
                    <p><strong>Bible App</strong></p>
                    <p className="version">Version 1.0.8</p>
                    <p className="description">
                        A peaceful companion for your spiritual journey.
                    </p>
                </div>
            </section>


            <section className="settings-section">
                <h2 className="section-title">Support</h2>

                <a
                    href="https://buymeacoffee.com/karaniph"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="support-button"
                >
                    ☕ Buy Me a Coffee
                </a>
                <p className="support-text">
                    Help keep this spiritual companion free and growing.
                </p>
            </section>
        </div>
    );
}
