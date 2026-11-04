#!/usr/bin/env python3
"""Informational cross-check: categorise differences between the official BSB text and the
eBible VPL XML (the official text is what ships; this only explains why eBible was not used).

Usage: ebible_crosscheck.py bsb.txt engbsb_vpl.xml [--show N]
"""
import argparse
import collections
import re

from bsb_source import parse_ebible, parse_official


def category(off, eb):
    if re.sub(r'\s+', '', off) != re.sub(r'\s+', '', eb):
        return 'wording differs'
    cats = []
    for rx, name in ((r' [,;:.!?)”’]', 'eBible has space before closing punctuation'),
                     (r'[(“‘] ', 'eBible has space after opening bracket/quote'),
                     (r' —|— ', 'eBible has space beside a dash'),
                     (r'[^\s—]—|—[^\s]', 'official has no space beside a dash (eBible differs)')):
        if bool(re.search(rx, eb)) != bool(re.search(rx, off)):
            cats.append(name)
    return 'spacing only: ' + ('; '.join(cats) if cats else 'other spacing')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('txt')
    ap.add_argument('xml')
    ap.add_argument('--show', type=int, default=5)
    a = ap.parse_args()
    off = {(b, c, v): t for b, c, v, t in parse_official(a.txt)[0]}
    eb = {(b, c, v): t for b, c, v, t in parse_ebible(a.xml)}
    counts, samples = collections.Counter(), collections.defaultdict(list)
    for k in sorted(set(off) & set(eb)):
        if off[k] != eb[k]:
            c = category(off[k], eb[k])
            counts[c] += 1
            samples[c].append(k)
    print('verses official=%d ebible=%d; differing=%d' % (len(off), len(eb), sum(counts.values())))
    for c, n in counts.most_common():
        print('%5d  %s' % (n, c))
        for k in samples[c][:a.show]:
            print('         %s %d:%d  official=%r  ebible=%r' % (k + (off[k][:90], eb[k][:90])))
    # Oddities inside the official text itself
    odd = collections.Counter()
    for t in off.values():
        for rx, name in ((r' [,;:.!?)]', 'official: space before closing punctuation'),
                         (r' —|— ', 'official: space beside a dash'),
                         (r'\w—\w', 'official: dash joining words without spaces (normal BSB style)')):
            if re.search(rx, t):
                odd[name] += 1
    print('official-text anomaly counts (verses):', dict(odd))


if __name__ == '__main__':
    main()
