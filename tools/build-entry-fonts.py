"""Reproducible entry-only subset of the existing OFL display font.
Reads public UI text only. The complete research/print fonts stay untouched.
Requires fonttools and brotli, as with build-reading-fonts.py.
"""
from pathlib import Path
import re
from fontTools import subset
from fontTools.ttLib import TTFont
root = Path(__file__).resolve().parents[1]
html = (root / 'index.html').read_text()
entry = re.search(r'<template id="empty-workspace-template">([\s\S]*?)</template>', html).group(1)
title = re.search(r'<h1 id="welcome-title"[^>]*>([\s\S]*?)</h1>', entry).group(1)
brand = re.search(r'<strong>([^<]+)</strong>', html).group(1)
# Only these three display roles use Rongxian Entry. Body copy uses the system
# interface font until the complete research theme is requested.
text = re.sub(r'<[^>]*>', '', title) + brand
options = subset.Options()
options.flavor = 'woff2'
font = TTFont(root / 'assets/fonts/reading-display-core.woff2')
worker = subset.Subsetter(options=options)
worker.populate(text=text)
worker.subset(font)
font.flavor = 'woff2'
font.save(root / 'assets/fonts/entry-display.woff2')
print('Entry display:', (root / 'assets/fonts/entry-display.woff2').stat().st_size, 'bytes')
