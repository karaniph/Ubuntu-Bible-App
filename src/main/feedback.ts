// The owner's feedback address. Single source of truth: the main process uses it to
// validate the mailto: link, and the renderer imports it for display and "Copy email".
// No imports, so both the main build and the renderer bundle can include it.
export const FEEDBACK_EMAIL = 'karanidevops@gmail.com';
export const FEEDBACK_SUBJECT = 'Bible App feedback';
export const FEEDBACK_MAILTO = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}`;
