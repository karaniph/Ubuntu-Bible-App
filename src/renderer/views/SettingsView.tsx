import React from 'react';
import './SettingsView.css';
import { AppSettings, LineSpacing, ReadingMode, TEXT_SIZES } from '../lib/storage';

interface SettingsViewProps {
    settings: AppSettings;
    onSettingsChange: (patch: Partial<AppSettings>) => void;
    onToast?: (message: string) => void;
}

const spacings: Array<{ id: LineSpacing; label: string }> = [
    { id: 'compact', label: 'Compact' },
    { id: 'normal', label: 'Normal' },
    { id: 'relaxed', label: 'Relaxed' },
];

const readingModes: Array<{ id: ReadingMode; label: string }> = [
    { id: 'verses', label: 'Verse by verse' },
    { id: 'paragraphs', label: 'Paragraphs' },
];

const themes = [
    { id: 'light', label: 'Light', icon: '☀️' },
    { id: 'dark', label: 'Dark', icon: '🌙' },
    { id: 'sepia', label: 'Sepia', icon: '📜' },
] as const;

export default function SettingsView({ settings, onSettingsChange }: SettingsViewProps) {
    const { theme } = settings;
    const openLink = (url: string) => (e: React.MouseEvent) => {
        e.preventDefault();
        window.electronAPI.openExternal(url);
    };

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
                                aria-pressed={theme === t.id}
                                onClick={() => onSettingsChange({ theme: t.id })}
                            >
                                <span className="theme-icon">{t.icon}</span>
                                <span className="theme-label">{t.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="setting-row">
                    <label className="setting-label" htmlFor="text-size-range">Text size</label>
                    <div className="range-control">
                        <span className="range-small" aria-hidden="true">A</span>
                        <input
                            id="text-size-range"
                            type="range"
                            min={0}
                            max={TEXT_SIZES.length - 1}
                            step={1}
                            value={settings.textSize}
                            aria-valuetext={`Size ${settings.textSize + 1} of ${TEXT_SIZES.length}`}
                            onChange={(e) => onSettingsChange({ textSize: Number(e.target.value) })}
                        />
                        <span className="range-large" aria-hidden="true">A</span>
                    </div>
                </div>

                <div className="setting-row">
                    <span className="setting-label" id="line-spacing-label">Line spacing</span>
                    <div className="choice-buttons" role="group" aria-labelledby="line-spacing-label">
                        {spacings.map((o) => (
                            <button
                                key={o.id}
                                className={`choice-button ${settings.lineSpacing === o.id ? 'active' : ''}`}
                                aria-pressed={settings.lineSpacing === o.id}
                                onClick={() => onSettingsChange({ lineSpacing: o.id })}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="setting-row">
                    <span className="setting-label" id="reading-mode-label">Reading layout</span>
                    <div className="choice-buttons" role="group" aria-labelledby="reading-mode-label">
                        {readingModes.map((o) => (
                            <button
                                key={o.id}
                                className={`choice-button ${settings.readingMode === o.id ? 'active' : ''}`}
                                aria-pressed={settings.readingMode === o.id}
                                onClick={() => onSettingsChange({ readingMode: o.id })}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="setting-row">
                    <label className="setting-label" htmlFor="verse-numbers-toggle">Show verse numbers</label>
                    <input
                        id="verse-numbers-toggle"
                        type="checkbox"
                        className="toggle-checkbox"
                        checked={settings.showVerseNumbers}
                        onChange={(e) => onSettingsChange({ showVerseNumbers: e.target.checked })}
                    />
                </div>
            </section>

            <section className="settings-section">
                <h2 className="section-title">About</h2>

                <div className="about-info">
                    <p><strong>Bible App</strong></p>
                    <p className="version">Version {__APP_VERSION__}</p>
                    <p className="description">
                        A peaceful companion for your spiritual journey.
                    </p>
                    <p className="description">
                        All your data (highlights, reflections, topics) stays on this device.
                        Nothing is ever sent anywhere.
                    </p>
                    <a
                        href="https://github.com/karaniph/Ubuntu-Bible-App/blob/master/PRIVACY.md"
                        onClick={openLink('https://github.com/karaniph/Ubuntu-Bible-App/blob/master/PRIVACY.md')}
                        className="privacy-link"
                    >
                        Privacy Policy
                    </a>
                </div>
            </section>


            <section className="settings-section">
                <h2 className="section-title">Support</h2>

                <a
                    href="https://buymeacoffee.com/karaniph"
                    onClick={openLink('https://buymeacoffee.com/karaniph')}
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
