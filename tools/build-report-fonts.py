"""Keep every original glyph; download common text first, rare glyphs by shard.

Run with fonttools installed. WOFF uses lossless zlib compression and is read by
the self-hosted PDF engine; it is not a raster or a substitute typeface.
"""
from pathlib import Path
import json
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'assets/report-fonts'

def ranges(points):
    result=[]
    for point in sorted(points):
        if result and point==result[-1][1]+1:
            result[-1][1]=point
        else:
            result.append([point,point])
    return result

def common_characters():
    points=set(range(0x3200))
    # GB2312 level-one characters plus the application's actual vocabulary.
    for first in range(0xB0,0xD8):
        for second in range(0xA1,0xFF):
            try: points.add(ord(bytes([first,second]).decode('gb2312')))
            except UnicodeDecodeError: pass
    for folder in ['app','docs']:
        for file in (ROOT/folder).rglob('*'):
            if file.suffix in ['.js','.md']:points.update(map(ord,file.read_text()))
    return points

def save_part(source,points,path):
    font=TTFont(source)
    options=subset.Options()
    options.layout_features=[]
    options.name_IDs=[1,2,3,4,6]
    worker=subset.Subsetter(options=options)
    worker.populate(unicodes=points)
    worker.subset(font)
    font.flavor='woff'
    font.save(path)

def main():
    sources={weight:TARGET/f'report-{weight}.otf' for weight in ['regular','medium']}
    coverage=set(TTFont(sources['regular']).getBestCmap())
    assert coverage==set(TTFont(sources['medium']).getBestCmap())
    core=coverage&common_characters()
    groups={'core':core}
    for point in sorted(coverage-core):
        groups.setdefault(f'u{point//512:03x}',set()).add(point)
    manifest={'version':'report-v32','parts':[]}
    for part,points in groups.items():
        entry={'id':part,'ranges':ranges(points),'files':{}}
        for weight,source in sources.items():
            name=f'print-{part}-{weight}.woff'
            save_part(source,points,TARGET/name)
            entry['files'][weight]=name
        manifest['parts'].append(entry)
    (TARGET/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
    original=sum(p.stat().st_size for p in sources.values())
    initial=sum((TARGET/f'print-core-{weight}.woff').stat().st_size for weight in sources)
    print(json.dumps({'originalBytes':original,'initialBytes':initial,'parts':len(groups),'glyphs':len(coverage),'coreGlyphs':len(core)}))

if __name__=='__main__':main()
