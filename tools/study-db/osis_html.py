"""Strict OSIS -> simple, safe HTML converter for the MHCC module.

Python 3 standard library only. Handles exactly the tags the MHCC module uses (see README.md);
any other tag, attribute value, stray markup or unbalanced element raises ValueError, which
fails the build. The output contains only the elements p, h4, b, span, table, tr, td and no
attribute except class="mh-title" (h4), class="mh-ref" (span) and class="mh-outline" (table).
"""

import html
import re

_TOKEN = re.compile(r'<[^<>]*>|[^<>]+|[<>]')
_TAG = re.compile(r'^<(/?)([A-Za-z]+)((?:\s+[A-Za-z]+="[^"<>]*")*)\s*(/?)>$')
_ATTR = re.compile(r'([A-Za-z]+)="([^"<>]*)"')
_WS = re.compile(r'\s+')

_PARAGRAPH_DIVS = {'x-p', 'introduction'}
_DROPPED_DIVS = {'x-milestone', 'book'}
_DROPPED_MILESTONES = {'x-importer', 'x-usfm-toc1', 'x-usfm-toc2', 'x-usfm-toc3'}
_TITLE_TYPES = {'x-s2', 'x-IS', 'x-ms', 'main'}

_ALLOWED_ATTRS = {
    'div': {'type', 'subType', 'sID', 'eID', 'osisID', 'canonical'},
    'chapter': {'n', 'osisID', 'sID', 'eID'},
    'milestone': {'type', 'subType', 'n'},
    'title': {'type'},
    'hi': {'type'},
    'reference': {'osisRef'},
    'table': set(),
    'row': set(),
    'cell': set(),
}

# OSIS element -> (HTML open tag, HTML close tag)
_ELEMENTS = {
    'title': ('<h4 class="mh-title">', '</h4>'),
    'hi': ('<b>', '</b>'),
    'reference': ('<span class="mh-ref">', '</span>'),
    'table': ('<table class="mh-outline">', '</table>'),
    'row': ('<tr>', '</tr>'),
    'cell': ('<td>', '</td>'),
}

ALLOWED_OUTPUT_TAGS = {
    'p': set(),
    'h4': {'mh-title'},
    'b': set(),
    'span': {'mh-ref'},
    'table': {'mh-outline'},
    'tr': set(),
    'td': set(),
}


def osis_to_html(text):
    out = []
    stack = []  # open OSIS element names
    p_open = False

    def in_block():
        # Inside a heading or a table, text is not wrapped in <p>.
        return any(name in ('title', 'table') for name in stack)

    def close_p():
        nonlocal p_open
        if p_open:
            out.append('</p>')
            p_open = False

    def open_p_if_needed():
        nonlocal p_open
        if not p_open and not in_block():
            out.append('<p>')
            p_open = True

    for token in _TOKEN.findall(text):
        if token in ('<', '>'):
            raise ValueError('stray markup character %r' % token)
        if not token.startswith('<'):
            chunk = _WS.sub(' ', html.unescape(token))
            if not chunk.strip():
                if p_open or in_block():
                    out.append(' ')
                continue
            if stack and stack[-1] in ('table', 'row'):
                raise ValueError('text outside a table cell: %r' % chunk[:40])
            open_p_if_needed()
            out.append(html.escape(chunk, quote=True))
            continue

        m = _TAG.match(token)
        if not m:
            raise ValueError('unparseable tag %r' % token[:80])
        closing, name, attr_text, self_closing = m.group(1), m.group(2), m.group(3), m.group(4)
        attrs = dict(_ATTR.findall(attr_text))
        if name not in _ALLOWED_ATTRS:
            raise ValueError('unknown tag <%s>' % name)
        extra = set(attrs) - _ALLOWED_ATTRS[name]
        if extra:
            raise ValueError('unknown attribute(s) %s on <%s>' % (sorted(extra), name))

        if name == 'div':
            if not self_closing or closing:
                raise ValueError('non-milestone <div>: %r' % token[:80])
            kind = attrs.get('type')
            if kind in _PARAGRAPH_DIVS:
                if in_block():
                    out.append(' ')
                else:
                    close_p()
            elif kind not in _DROPPED_DIVS:
                raise ValueError('unknown div type %r' % kind)
            continue
        if name == 'chapter':
            if not self_closing or closing:
                raise ValueError('non-milestone <chapter>')
            continue
        if name == 'milestone':
            if not self_closing or closing or attrs.get('type') not in _DROPPED_MILESTONES:
                raise ValueError('unexpected milestone %r' % token[:80])
            continue

        # Container elements.
        if self_closing:
            raise ValueError('self-closing <%s>' % name)
        if closing:
            if attrs:
                raise ValueError('attributes on closing tag %r' % token)
            if not stack or stack[-1] != name:
                raise ValueError('unbalanced </%s> (open: %s)' % (name, stack))
            stack.pop()
            out.append(_ELEMENTS[name][1])
            continue

        if name == 'title':
            if attrs.get('type') not in _TITLE_TYPES:
                raise ValueError('unknown title type %r' % attrs.get('type'))
            if stack:
                raise ValueError('<title> nested in %s' % stack)
            close_p()
        elif name == 'hi':
            if attrs.get('type') != 'bold':
                raise ValueError('unknown hi type %r' % attrs.get('type'))
            if stack and stack[-1] in ('table', 'row'):
                raise ValueError('<hi> outside a table cell')
            open_p_if_needed()
        elif name == 'reference':
            if stack and stack[-1] in ('table', 'row'):
                raise ValueError('<reference> outside a table cell')
            open_p_if_needed()
        elif name == 'table':
            if stack:
                raise ValueError('<table> nested in %s' % stack)
            close_p()
        elif name == 'row':
            if not stack or stack[-1] != 'table':
                raise ValueError('<row> outside <table>')
        elif name == 'cell':
            if not stack or stack[-1] != 'row':
                raise ValueError('<cell> outside <row>')
        stack.append(name)
        out.append(_ELEMENTS[name][0])

    if stack:
        raise ValueError('unclosed elements %s' % stack)
    close_p()
    result = ''.join(out)
    # Tidy whitespace next to block boundaries and drop empty paragraphs.
    result = re.sub(r'\s*(<(?:p|h4 class="mh-title"|table class="mh-outline"|tr|td)>)\s*', r'\1', result)
    result = re.sub(r'\s*(</(?:p|h4|table|tr|td)>)\s*', r'\1', result)
    result = re.sub(r'<p></p>', '', result)
    result = re.sub(r' {2,}', ' ', result).strip()
    check_html(result)
    return result


_OUT_TAG = re.compile(r'<(/?)([a-z0-9]+)((?:\s+[a-z]+="[^"]*")*)\s*>')


def check_html(result):
    """Raise ValueError unless `result` uses only the allowed tags and class values."""
    rest = _OUT_TAG.sub('', result)
    if '<' in rest or '>' in rest:
        raise ValueError('unexpected markup in output')
    for m in _OUT_TAG.finditer(result):
        closing, tag, attr_text = m.group(1), m.group(2), m.group(3)
        if tag not in ALLOWED_OUTPUT_TAGS:
            raise ValueError('disallowed output tag <%s>' % tag)
        attrs = _ATTR.findall(attr_text)
        if closing and attrs:
            raise ValueError('attributes on closing tag')
        for key, value in attrs:
            if key != 'class' or value not in ALLOWED_OUTPUT_TAGS[tag]:
                raise ValueError('disallowed attribute %s="%s" on <%s>' % (key, value, tag))
