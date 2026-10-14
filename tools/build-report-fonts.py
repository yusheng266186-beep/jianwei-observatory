"""Keep every original glyph; download common text first, rare glyphs by shard.

Run with fonttools installed. WOFF uses lossless zlib compression and is read by
the self-hosted PDF engine; it is not a raster or a substitute typeface.
"""
from pathlib import Path
import json
from concurrent.futures import ProcessPoolExecutor
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
    points=set(range(32,127))|set(range(0x3000,0x3040))
    # Report vocabulary first; names and uncommon notes use lossless shards.
    # Whole-app documentation and unused alphabets cannot delay a first PDF.
    for name in ['app/engine/reports.js','app/io/print-document.js','app/io/report-design.js','app/brand.js','app/ui/html.js']:
        points.update(map(ord,(ROOT/name).read_text()))
    points.update(map(ord,'赵钱孙李周吴郑王冯陈卫蒋沈韩杨朱秦许何吕施张孔曹严华金魏陶姜谢邹范彭鲁韦马方任袁柳史唐薛雷贺汤殷罗毕郝安常于傅齐康伍余顾孟黄萧尹姚邵汪毛宋熊舒祝董梁杜季贾江郭梅林钟徐邱高夏蔡田樊胡万卢丁邓洪石崔龚程陆荣段侯白赖乔谭曾关叶刘黎龙苏潘戴温庄廖翟邢邱颜程向游'))
    return points

def save_part(source,points,path):
    font=TTFont(source)
    options=subset.Options()
    options.layout_features=[]
    options.name_IDs=[1,2,3,4,6]
    worker=subset.Subsetter(options=options)
    worker.populate(unicodes=points)
    worker.subset(font)
    # The bundled FontKit decoder reads format 0's glyph count before its
    # CharStrings pointer is resolved. Format 3 is standard CFF and avoids
    # that ordering problem, including punctuation-only subsets.
    font['CFF '].cff.topDictIndex[0].FDSelect.format=3
    weight='SemiBold' if 'medium' in path.name else 'Regular'
    cff=font['CFF '].cff;top=cff.topDictIndex[0]
    cff.fontNames=['RongxianSongti-'+weight]
    top.FullName='Rongxian Songti '+weight;top.FamilyName='Rongxian Songti'
    for i,fd in enumerate(top.FDArray):fd.FontName='RongxianSongti-'+weight+'-FD'+str(i)
    for name in font['name'].names:
        if name.nameID in [1,2,3,4,6]:
            value={1:'Rongxian Songti',2:weight,3:'RongxianSongti-'+weight,4:'Rongxian Songti '+weight,6:'RongxianSongti-'+weight}[name.nameID]
            name.string=value.encode(name.getEncoding())
    font.flavor='woff'
    font.save(path)
    return path.name

def main():
    sources={weight:ROOT/'.audit-output/report-font-sources'/f'report-{weight}.otf' for weight in ['regular','medium']}
    coverage=set(TTFont(sources['regular']).getBestCmap())
    assert coverage==set(TTFont(sources['medium']).getBestCmap())
    core=coverage&common_characters()
    groups={'core':core}
    for point in sorted(coverage-core):
        groups.setdefault(f'u{point//256:03x}',set()).add(point)
    manifest={'version':'report-v36','family':'Rongxian Songti','source':'Source Han Serif SC','parts':[]}
    jobs=[]
    with ProcessPoolExecutor(max_workers=2) as pool:
        for part,points in groups.items():
            entry={'id':part,'ranges':ranges(points),'files':{}}
            for weight,source in sources.items():
                name=f'print-{part}-{weight}.woff'
                jobs.append((entry,weight,pool.submit(save_part,source,points,TARGET/name)))
                entry['files'][weight]=name
            manifest['parts'].append(entry)
        for entry,weight,job in jobs:entry['files'][weight]=job.result()
    (TARGET/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
    original=sum(p.stat().st_size for p in sources.values())
    initial=sum((TARGET/f'print-core-{weight}.woff').stat().st_size for weight in sources)
    print(json.dumps({'originalBytes':original,'initialBytes':initial,'parts':len(groups),'glyphs':len(coverage),'coreGlyphs':len(core)}))

if __name__=='__main__':main()
