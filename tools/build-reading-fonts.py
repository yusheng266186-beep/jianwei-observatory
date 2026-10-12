"""Build school typography from OFL sources, static UI and public GB2312 only.

Requires fontTools and brotli. Full sources stay in .audit-output/font-sources.
No workbooks, student names, identifiers or private datasets are read.
"""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
import json

root = Path(__file__).resolve().parents[1]
sources = root / '.audit-output/font-sources'
ui = ''.join(p.read_text() for p in (root / 'app').rglob('*.js')) + (root / 'index.html').read_text()
core = {ord(c) for c in ui if not c.isspace()} | set(range(32, 127))
levels = []
for high_bytes in [range(0xB0, 0xD8), range(0xD8, 0xF8)]:
    chars = set()
    for high in high_bytes:
        for low in range(0xA1, 0xFF):
            try:
                chars.add(ord(bytes([high, low]).decode('gb2312')))
            except UnicodeDecodeError:
                pass
    levels.append(chars - core)


def ranges(codepoints):
    result = []
    start = end = None
    for value in sorted(codepoints):
        if start is not None and value == end + 1:
            end = value
        else:
            if start is not None:
                result.append(f'U+{start:X}' + (f'-{end:X}' if end != start else ''))
            start = end = value
    if start is not None:
        result.append(f'U+{start:X}' + (f'-{end:X}' if end != start else ''))
    return ','.join(result)


css, manifest = [], []


def build(kind, family, source, weight, style, section, wanted):
    font = TTFont(sources / source)
    if 'fvar' in font:
        font = instantiateVariableFont(font, {'wdth': 100}, inplace=True)
        # Instancing removes empty tuples; the subsetter expects every glyph key.
        if 'gvar' in font:
            for glyph in font.getGlyphOrder():
                font['gvar'].variations.setdefault(glyph, [])
    chars = wanted & set(font.getBestCmap())
    options = subset.Options()
    options.layout_features = ['*']
    options.layout_languages = ['ZHS', 'dflt']
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']
    options.hinting = False
    selection = subset.Subsetter(options=options)
    selection.populate(unicodes=chars)
    selection.subset(font)
    postscript = family.replace(' ', '') + '-' + style
    names = {1: family, 2: style, 3: postscript + '-Subset-1', 4: family + ' ' + style,
             6: postscript, 16: family, 17: style}
    for record in font['name'].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding(), errors='replace')
    if 'CFF ' in font:
        cff = font['CFF '].cff
        cff.fontNames = [postscript]
        for top in cff.topDictIndex:
            top.FamilyName = family
            top.FullName = family + ' ' + style
            if hasattr(top, 'FDArray'):
                for private_font in top.FDArray:
                    if hasattr(private_font, 'FontName'):
                        private_font.FontName = postscript
    font.flavor = 'woff2'
    filename = f'reading-{kind}' + (f'-{section}' if section else '') + '.woff2'
    dest = root / 'assets/fonts' / filename
    font.save(dest)
    font.close()
    css.append(f"@font-face{{font-family:'{family}';src:url('../assets/fonts/{filename}?v=type-v16') format('woff2');font-weight:{weight};font-style:normal;font-display:swap;unicode-range:{ranges(chars)}}}")
    manifest.append({'file': filename, 'family': family, 'weight': weight, 'section': section or 'metrics',
                     'glyphs': len(chars), 'bytes': dest.stat().st_size})
    print(filename, len(chars), 'glyphs', dest.stat().st_size, 'bytes', flush=True)


for kind, family, source, weight, style in [
    ('display', 'Rongxian Display', 'serif-semibold.otf', '600', 'SemiBold'),
    ('ui-regular', 'Rongxian Interface', 'sans-regular.otf', '400', 'Regular'),
    ('ui-medium', 'Rongxian Interface', 'sans-medium.otf', '500', 'Medium'),
]:
    for section, wanted in [('core', core), ('common', levels[0]), ('extended', levels[1])]:
        build(kind, family, source, weight, style, section, wanted)

build('metrics', 'Rongxian Metric', 'plex-regular.ttf', '100 700', 'Regular', '',
      set(range(32, 127)) | {0xB7, 0xD7, 0x2013, 0x2014, 0x2212, 0x221E})

(root / 'styles/reading-fonts.css').write_text(
    '/* OFL: Source Han Serif SemiBold, Source Han Sans Regular/Medium, IBM Plex Sans metrics. */\n'
    + '\n'.join(css) + '\n')
license_text = '\n\n'.join([
    'Source Han Serif SC / subset family Rongxian Display\nSource: https://github.com/adobe-fonts/source-han-serif/tree/release\n'
    + (sources / 'serif-source-license.txt').read_text(),
    'Source Han Sans SC / subset family Rongxian Interface\nSource: https://github.com/adobe-fonts/source-han-sans/tree/release\n'
    + (sources / 'sans-source-license.txt').read_text(),
    'IBM Plex Sans / subset family Rongxian Metric\nSource: https://github.com/google/fonts/tree/main/ofl/ibmplexsans\n'
    + (sources / 'plex-license.txt').read_text(),
])
(root / 'assets/fonts/reading-LICENSE.txt').write_text(
    '\n'.join(line.rstrip() for line in license_text.splitlines()) + '\n')
(root / 'assets/fonts/reading-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
