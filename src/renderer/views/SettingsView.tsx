import React, { useRef, useState } from 'react';
import './SettingsView.css';
import type { BackupPayload } from '../../main/preload';

interface SettingsViewProps {
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
    const importInputRef = useRef<HTMLInputElement | null>(null);
    const [backupBusy, setBackupBusy] = useState(false);

    const handleExportBackup = async () => {
        try {
            setBackupBusy(true);
            const payload = await window.electronAPI.exportBackup();
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `bible-app-backup-${new Date().toISOString().slice(0, 10)}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
            onToast?.('Backup exported successfully.');
        } catch {
            onToast?.('Backup export failed.');
        } finally {
            setBackupBusy(false);
        }
    };

    const handleImportBackup = async (file: File) => {
        try {
            setBackupBusy(true);
            const text = await file.text();
            const payload = JSON.parse(text) as BackupPayload;
            await window.electronAPI.importBackup(payload);
            onToast?.('Backup imported successfully.');
        } catch {
            onToast?.('Backup import failed. Please use a valid JSON backup file.');
        } finally {
            setBackupBusy(false);
            if (importInputRef.current) importInputRef.current.value = '';
        }
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
                    <p className="version">Version 1.0.0</p>
                    <p className="description">
                        A peaceful companion for your spiritual journey.
                    </p>
                </div>
            </section>

            <section className="settings-section">
                <h2 className="section-title">Backup</h2>
                <p className="backup-hint">Export or import your saved reflections as JSON.</p>
                <div className="backup-actions">
                    <button className="backup-button" onClick={handleExportBackup} disabled={backupBusy}>
                        Export Backup
                    </button>
                    <button className="backup-button secondary" onClick={() => importInputRef.current?.click()} disabled={backupBusy}>
                        Import Backup
                    </button>
                    <input
                        ref={importInputRef}
                        type="file"
                        accept="application/json"
                        className="backup-file-input"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImportBackup(file);
                        }}
                    />
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
