"""Refresh the first-report vocabulary without invalidating cached rare glyphs.

Run with fonttools installed and the licensed OTF sources used by
build-report-fonts.py in .audit-output/report-font-sources.
"""
import importlib.util
import json
from pathlib import Path
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('report_fonts', ROOT / 'tools/build-report-fonts.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
TARGET = ROOT / 'assets/report-fonts'
VERSION = 'v38'


def points(part):
    return {point for start, end in part['ranges'] for point in range(start, end + 1)}


def main():
    original = json.loads((TARGET / 'manifest.json').read_text())
    sources = {weight: ROOT / '.audit-output/report-font-sources' / f'report-{weight}.otf'
               for weight in ['regular', 'medium']}
    coverage = set(TTFont(sources['regular']).getBestCmap())
    assert coverage == set(TTFont(sources['medium']).getBestCmap())
    wanted = builder.common_characters() | points(original['parts'][0])
    for source in ['app/data/compat.js', 'app/engine/report-selection.js',
                   'app/engine/knowledge.js', 'app/engine/paper-settings.js']:
        wanted.update(map(ord, (ROOT / source).read_text()))
    wanted.update(map(ord, '–函数图像阅读理解听力七选五完形填空语法填空写作作文材料分析'))
    core = coverage & wanted
    manifest = {**original, 'version': 'report-' + VERSION, 'parts': []}
    for part in original['parts']:
        entry = {**part}
        if part['id'] == 'core':
            entry['ranges'] = builder.ranges(core)
            entry['files'] = {}
            for weight, source in sources.items():
                name = f'print-core-{VERSION}-{weight}.woff'
                builder.save_part(source, core, TARGET / name)
                entry['files'][weight] = name
        else:
            remaining = points(part) - core
            if not remaining:
                continue
            entry['ranges'] = builder.ranges(remaining)
        manifest['parts'].append(entry)
    all_points = set()
    for part in manifest['parts']:
        declared = points(part)
        assert not all_points & declared, 'A glyph must belong to exactly one part'
        all_points |= declared
    assert all_points == coverage, 'Every original glyph remains available'
    (TARGET / f'manifest-{VERSION}.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({'coreGlyphs': len(core), 'coreBytes': sum((TARGET / file).stat().st_size
                     for file in manifest['parts'][0]['files'].values()), 'totalGlyphs': len(coverage)}))


if __name__ == '__main__':
    main()
