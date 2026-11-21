import React from 'react';

// Rebuilds commentary HTML (already sanitised when study.db was built) as React
// elements from an allow-list. DOMParser gives an inert document: no scripts run
// and nothing loads. Nothing is ever inserted as raw HTML.

const ALLOWED: Record<string, string> = {
    P: 'p',
    H4: 'h4',
    B: 'b',
    I: 'i',
    SPAN: 'span',
    TABLE: 'table',
    TBODY: 'tbody',
    TR: 'tr',
    TD: 'td',
};
const ALLOWED_CLASSES = new Set(['mh-ref', 'mh-outline', 'mh-title']);
const DROPPED = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'LINK', 'META', 'TEMPLATE', 'SVG', 'MATH']);

function convert(node: Node, key: string): React.ReactNode {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (DROPPED.has(tag)) return null;
    const children = Array.from(el.childNodes).map((child, i) => convert(child, `${key}.${i}`));
    const mapped = ALLOWED[tag];
    if (!mapped) return <React.Fragment key={key}>{children}</React.Fragment>;
    const className = el.getAttribute('class');
    const props: { key: string; className?: string } = { key };
    if (className && ALLOWED_CLASSES.has(className)) props.className = className;
    return React.createElement(mapped, props, ...children);
}

export function renderSafeHtml(html: string): React.ReactNode {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(doc.body.childNodes).map((node, i) => convert(node, String(i)));
}
