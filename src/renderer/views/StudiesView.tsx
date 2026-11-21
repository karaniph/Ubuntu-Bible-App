import { useCallback, useEffect, useRef, useState } from 'react';
import './StudiesView.css';
import { NavigationTarget } from '../App';
import type { StudyDetail, StudyPassageWithText, StudySummary, Translation } from '../../main/preload';
import { BookLike, buildBookLookup, formatPassage, parsePassage } from '../lib/reference';
import { loadLastRead, stripPilcrow } from '../lib/storage';

interface StudiesViewProps {
    onNavigateToBible: (target: NavigationTarget) => void;
    onError?: (message: string) => void;
    onToast?: (message: string) => void;
    openStudyId: number | null;
    onOpenStudy: (studyId: number | null) => void;
}

const OMITTED = 'This verse is not included in this translation.';
const PARSE_HELP = 'Couldn\u2019t read that reference. Try \u201CPsalms 1-7\u201D, \u201CRomans 8\u201D or \u201CJohn 3:16-21\u201D.';

type StudyForm = { mode: 'create' | 'rename'; name: string; description: string };

export default function StudiesView({ onNavigateToBible, onError, onToast, openStudyId, onOpenStudy }: StudiesViewProps) {
    const [studies, setStudies] = useState<StudySummary[]>([]);
    const [listLoaded, setListLoaded] = useState(false);
    const [translations, setTranslations] = useState<Translation[]>([]);
    const [translationId, setTranslationId] = useState(0);
    const [bookLookup, setBookLookup] = useState<Map<string, BookLike>>(new Map());
    const [detail, setDetail] = useState<StudyDetail | null>(null);
    const [form, setForm] = useState<StudyForm | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [passageInput, setPassageInput] = useState('');
    const [message, setMessage] = useState<string | null>(null);
    const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    // Latest typed note per passage (saved or not), so Remove can ask first when a note exists.
    const drafts = useRef(new Map<number, string>());
    // App recreates its callbacks on every render; keep the latest without refetching.
    const callbacks = useRef({ onError, onOpenStudy });
    callbacks.current = { onError, onOpenStudy };

    const loadList = useCallback(async () => {
        try {
            setStudies(await window.electronAPI.listStudies());
        } catch {
            callbacks.current.onError?.('Could not load your studies.');
        } finally {
            setListLoaded(true);
        }
    }, []);

    useEffect(() => {
        void loadList();
        window.electronAPI.getBooks()
            .then((books) => setBookLookup(buildBookLookup(books)))
            .catch(() => onError?.('Could not load books.'));
        // Same default as Search: the remembered translation, else KJV, else the first.
        window.electronAPI.getTranslations()
            .then((trans) => {
                setTranslations(trans);
                const kjv = trans.find(t => t.code.includes('KJV') || t.name.includes('King James'));
                const last = loadLastRead();
                const remembered = last && trans.find(t => t.id === last.translationId);
                setTranslationId(remembered ? remembered.id : kjv ? kjv.id : (trans[0]?.id ?? 0));
            })
            .catch(() => onError?.('Could not load translations.'));
    }, []);

    const loadDetail = useCallback(async (studyId: number, transId: number) => {
        try {
            const study = await window.electronAPI.getStudy(studyId, transId);
            if (!study) {
                setDetail(null);
                callbacks.current.onOpenStudy(null);
                return;
            }
            setDetail(study);
        } catch {
            callbacks.current.onError?.('Could not load this study.');
        }
    }, []);

    useEffect(() => {
        if (openStudyId === null) {
            setDetail(null);
            return;
        }
        if (translationId > 0) void loadDetail(openStudyId, translationId);
    }, [openStudyId, translationId, loadDetail]);

    const reload = async () => {
        await loadList();
        if (openStudyId !== null && translationId > 0) await loadDetail(openStudyId, translationId);
    };

    const openStudy = (studyId: number) => {
        setForm(null);
        setConfirmDelete(false);
        setConfirmRemoveId(null);
        setMessage(null);
        setPassageInput('');
        if (studyId !== openStudyId) setDetail(null);
        onOpenStudy(studyId);
    };

    const saveForm = async () => {
        if (!form || busy) return;
        setBusy(true);
        try {
            const result = form.mode === 'create'
                ? await window.electronAPI.createStudy(form.name, form.description)
                : await window.electronAPI.updateStudy(openStudyId ?? 0, form.name, form.description);
            if (!result.ok) {
                setFormError(result.error);
                return;
            }
            setForm(null);
            setFormError(null);
            onToast?.(form.mode === 'create' ? 'Study created' : 'Study saved');
            if (form.mode === 'create') {
                await loadList();
                openStudy(result.value.id);
            } else {
                await reload();
            }
        } catch {
            setFormError('Could not save your study. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const deleteStudy = async () => {
        if (!detail || busy) return;
        setBusy(true);
        try {
            const result = await window.electronAPI.deleteStudy(detail.id);
            if (!result.ok) {
                onError?.(result.error);
                return;
            }
            setConfirmDelete(false);
            setDetail(null);
            onOpenStudy(null);
            onToast?.(`Deleted \u201C${detail.name}\u201D`);
            await loadList();
        } catch {
            onError?.('Could not delete the study.');
        } finally {
            setBusy(false);
        }
    };

    const addPassage = async () => {
        if (!detail || busy) return;
        const ref = parsePassage(passageInput, bookLookup);
        if (!ref) {
            setMessage(PARSE_HELP);
            return;
        }
        setBusy(true);
        try {
            const result = await window.electronAPI.addStudyPassages(detail.id, [{
                bookCode: ref.book.code,
                chapterStart: ref.chapterStart,
                chapterEnd: ref.chapterEnd,
                verseStart: ref.verseStart ?? null,
                verseEnd: ref.verseEnd ?? null,
            }]);
            if (!result.ok) {
                setMessage(result.error);
                return;
            }
            setMessage(null);
            setPassageInput('');
            await reload();
        } catch {
            setMessage('Could not save your study. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    const movePassage = async (passageId: number, direction: 'up' | 'down') => {
        try {
            const result = await window.electronAPI.moveStudyPassage(passageId, direction);
            if (!result.ok) onError?.(result.error);
            await reload();
        } catch {
            onError?.('Could not move the passage.');
        }
    };

    const removePassage = async (passageId: number) => {
        try {
            const result = await window.electronAPI.removeStudyPassage(passageId);
            setConfirmRemoveId(null);
            if (!result.ok) {
                onError?.(result.error);
                return;
            }
            drafts.current.delete(passageId);
            await reload();
        } catch {
            onError?.('Could not remove the passage.');
        }
    };

    const requestRemove = (passage: StudyPassageWithText) => {
        const note = drafts.current.get(passage.id) ?? passage.note;
        if (note.trim()) setConfirmRemoveId(passage.id);
        else void removePassage(passage.id);
    };

    const openInReader = (p: StudyPassageWithText) => {
        onNavigateToBible({
            bookId: p.book_id,
            chapter: p.chapter_start,
            translationId: translationId || undefined,
            verse: p.verse_start ?? undefined,
            verseEnd: p.verse_start !== null && p.verse_end !== null && p.verse_end > p.verse_start ? p.verse_end : undefined,
        });
    };

    const renderForm = () => form && (
        <form
            className="study-form"
            onSubmit={(e) => {
                e.preventDefault();
                void saveForm();
            }}
        >
            <label className="study-form-label">
                Name
                <input
                    className="study-name-input"
                    value={form.name}
                    maxLength={100}
                    placeholder="e.g. Wednesday Bible Study"
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoFocus
                />
            </label>
            <label className="study-form-label">
                Description (optional)
                <textarea
                    className="study-description-input"
                    value={form.description}
                    maxLength={1000}
                    rows={3}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
            </label>
            {formError && <p className="study-message" role="status">{formError}</p>}
            <div className="study-form-actions">
                <button type="submit" className="study-save-btn" disabled={busy || !form.name.trim()}>
                    {form.mode === 'create' ? 'Create study' : 'Save'}
                </button>
                <button
                    type="button"
                    className="study-cancel-btn"
                    onClick={() => {
                        setForm(null);
                        setFormError(null);
                    }}
                >
                    Cancel
                </button>
            </div>
        </form>
    );

    const renderPassageText = (p: StudyPassageWithText) => {
        if (p.verses.length === 0) return <p className="study-verse-omitted">{OMITTED}</p>;
        const multiChapter = p.chapter_end > p.chapter_start;
        let lastChapter = 0;
        return p.verses.map((v) => {
            const heading = multiChapter && v.chapter !== lastChapter
                ? <h4 className="passage-chapter-heading">{p.book_name} {v.chapter}</h4>
                : null;
            lastChapter = v.chapter;
            const text = stripPilcrow(v.text);
            return (
                <div key={v.id}>
                    {heading}
                    <p className="passage-verse">
                        <sup className="passage-verse-number">{v.verse}</sup>
                        {text ? text : <span className="study-verse-omitted">{OMITTED}</span>}
                    </p>
                </div>
            );
        });
    };

    const renderDetail = () => {
        if (form) return renderForm();
        if (!detail) {
            return (
                <p className="studies-empty">
                    {studies.length === 0
                        ? 'No studies yet. Create one to collect passages and notes for a Bible study.'
                        : 'Choose a study on the left, or create a new one.'}
                </p>
            );
        }
        return (
            <>
                <header className="study-header">
                    <div className="study-heading">
                        <h1 className="study-title">{detail.name}</h1>
                        {detail.description && <p className="study-description">{detail.description}</p>}
                    </div>
                    <div className="study-header-actions">
                        <select
                            className="study-translation-select"
                            aria-label="Translation"
                            value={translationId}
                            onChange={(e) => setTranslationId(Number(e.target.value))}
                        >
                            {translations.map((t) => (
                                <option key={t.id} value={t.id}>{t.name || t.code}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            className="study-rename-btn"
                            onClick={() => {
                                setConfirmDelete(false);
                                setFormError(null);
                                setForm({ mode: 'rename', name: detail.name, description: detail.description });
                            }}
                        >
                            Rename
                        </button>
                        <button type="button" className="study-delete-btn" onClick={() => setConfirmDelete(true)}>
                            Delete
                        </button>
                    </div>
                </header>

                {confirmDelete && (
                    <div className="study-confirm-delete" role="alertdialog">
                        <p>Delete “{detail.name}”? Its passages and notes will be removed. This can't be undone.</p>
                        <div className="study-form-actions">
                            <button type="button" className="study-confirm-yes" onClick={() => void deleteStudy()} disabled={busy}>
                                Delete study
                            </button>
                            <button type="button" className="study-confirm-cancel" onClick={() => setConfirmDelete(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                <div className="passage-add">
                    <input
                        className="passage-add-input"
                        value={passageInput}
                        placeholder="Add a passage, e.g. Psalms 1-7, Romans 8, John 3:16-21"
                        aria-label="Passage to add"
                        onChange={(e) => {
                            setPassageInput(e.target.value);
                            setMessage(null);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void addPassage();
                            }
                        }}
                    />
                    <button
                        type="button"
                        className="passage-add-btn"
                        disabled={busy || !passageInput.trim()}
                        onClick={() => void addPassage()}
                    >
                        Add
                    </button>
                </div>
                {message && <p className="study-message" role="status">{message}</p>}

                {detail.passages.length === 0 ? (
                    <p className="studies-empty">
                        Add a passage above, or select verses in the Bible reader and choose Add to study.
                    </p>
                ) : (
                    detail.passages.map((p, i) => (
                        <section key={p.id} className="study-passage">
                            <div className="passage-header">
                                <button
                                    type="button"
                                    className="passage-ref"
                                    title="Open in the Bible reader"
                                    onClick={() => openInReader(p)}
                                >
                                    {formatPassage(p.book_name, p.chapter_start, p.chapter_end, p.verse_start, p.verse_end)}
                                </button>
                                <div className="passage-actions">
                                    <button
                                        type="button"
                                        className="passage-up"
                                        aria-label="Move up"
                                        disabled={i === 0}
                                        onClick={() => void movePassage(p.id, 'up')}
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type="button"
                                        className="passage-down"
                                        aria-label="Move down"
                                        disabled={i === detail.passages.length - 1}
                                        onClick={() => void movePassage(p.id, 'down')}
                                    >
                                        ↓
                                    </button>
                                    <button type="button" className="passage-remove" onClick={() => requestRemove(p)}>
                                        Remove
                                    </button>
                                </div>
                            </div>
                            {confirmRemoveId === p.id && (
                                <div className="study-confirm-delete" role="alertdialog">
                                    <p>Remove this passage and its note?</p>
                                    <div className="study-form-actions">
                                        <button type="button" className="study-confirm-yes" onClick={() => void removePassage(p.id)}>
                                            Remove passage
                                        </button>
                                        <button type="button" className="study-confirm-cancel" onClick={() => setConfirmRemoveId(null)}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="passage-text">{renderPassageText(p)}</div>
                            <NoteEditor
                                passageId={p.id}
                                initialNote={p.note}
                                onDraft={(text) => drafts.current.set(p.id, text)}
                            />
                        </section>
                    ))
                )}
            </>
        );
    };

    return (
        <div className="studies-view">
            <aside className="studies-list">
                <div className="studies-list-header">
                    <h2 className="studies-list-title">Studies</h2>
                    <button
                        type="button"
                        className="study-new-btn"
                        onClick={() => {
                            setConfirmDelete(false);
                            setFormError(null);
                            setForm({ mode: 'create', name: '', description: '' });
                        }}
                    >
                        + New study
                    </button>
                </div>
                <ul>
                    {studies.map((s) => (
                        <li key={s.id}>
                            <button
                                type="button"
                                className={`study-list-item ${s.id === openStudyId ? 'active' : ''}`}
                                onClick={() => openStudy(s.id)}
                            >
                                <span className="study-list-name">{s.name}</span>
                                <span className="study-list-count">
                                    {s.passage_count} passage{s.passage_count === 1 ? '' : 's'}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
                {listLoaded && studies.length === 0 && !form && (
                    <p className="studies-list-empty">No studies yet.</p>
                )}
            </aside>
            <div className="study-detail">{renderDetail()}</div>
        </div>
    );
}

interface NoteEditorProps {
    passageId: number;
    initialNote: string;
    onDraft: (text: string) => void;
}

// One editor per passage (keyed by passage id), so reloading the study, e.g. after a
// translation switch, never resets what the user is typing. Saves 700 ms after typing
// stops, on blur, and when the editor goes away.
function NoteEditor({ passageId, initialNote, onDraft }: NoteEditorProps) {
    const [draft, setDraft] = useState(initialNote);
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const draftRef = useRef(initialNote);
    const savedRef = useRef(initialNote);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mounted = useRef(true);

    const save = useCallback(async () => {
        if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        const text = draftRef.current;
        if (text === savedRef.current) {
            // Typed and then undone back to the saved text: nothing to write.
            if (mounted.current) setStatus((s) => (s === 'saving' ? 'saved' : s));
            return;
        }
        if (mounted.current) setStatus('saving');
        try {
            const result = await window.electronAPI.updateStudyPassageNote(passageId, text);
            if (result.ok) savedRef.current = text;
            if (!mounted.current) return;
            if (!result.ok) setStatus('error');
            else if (draftRef.current === text) setStatus('saved');
        } catch {
            if (mounted.current) setStatus('error');
        }
    }, [passageId]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            void save();
        };
    }, [save]);

    return (
        <div className="passage-note-box">
            <textarea
                className="passage-note"
                value={draft}
                maxLength={20000}
                rows={3}
                placeholder="Notes for this passage"
                aria-label="Notes for this passage"
                onChange={(e) => {
                    const text = e.target.value;
                    setDraft(text);
                    draftRef.current = text;
                    onDraft(text);
                    setStatus('saving');
                    if (timer.current) clearTimeout(timer.current);
                    timer.current = setTimeout(() => void save(), 700);
                }}
                onBlur={() => void save()}
            />
            <span className="passage-note-status" aria-live="polite">
                {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Could not save' : ''}
            </span>
        </div>
    );
}
