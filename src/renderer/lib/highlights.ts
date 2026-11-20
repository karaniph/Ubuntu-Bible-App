// Highlight colours, in the order they are shown. The id is stored in the database
// (highlights.color) and used as the CSS class suffix (highlight-<id>, color-option <id>).
// The first four are the original colours; never rename an id, saved highlights use it.
export const HIGHLIGHT_COLORS = [
    { id: 'yellow', label: 'Yellow' },
    { id: 'green', label: 'Green' },
    { id: 'blue', label: 'Blue' },
    { id: 'pink', label: 'Pink' },
    { id: 'orange', label: 'Orange' },
    { id: 'purple', label: 'Purple' },
    { id: 'red', label: 'Red' },
    { id: 'teal', label: 'Teal' },
] as const;

export type HighlightColor = typeof HIGHLIGHT_COLORS[number]['id'];
