"""Add scientific Unicode superscripts/subscripts using the licensed Songti outlines.

No system font or replacement character is embedded. The original Source Han
Serif glyphs are scaled/positioned to produce the missing scientific glyphs;
Unicode mapping and searchable PDF text remain intact. Existing shards stay cached.
Run with fonttools and the same OFL sources as build-report-fonts.py.
"""
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.cu2quPen import Cu2QuPen

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'assets/report-fonts'
SCRIPTS=[('₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₕₖₗₘₙₚₛₜ','0123456789+-=()aeoxhklmnpst',-150),
         ('⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ','0123456789+-=()ni',370)]

def main():
 manifest=json.loads((TARGET/'manifest-v38.json').read_text())
 coverage={p for part in manifest['parts'] for a,b in part['ranges'] for p in range(a,b+1)}
 mapping={ord(char):(base,y) for chars,bases,y in SCRIPTS for char,base in zip(chars,bases) if ord(char) not in coverage}
 files={}
 for weight in ['regular','medium']:
  source=TTFont(ROOT/'.audit-output/report-font-sources'/f'report-{weight}.otf')
  cmap=source.getBestCmap();glyphset=source.getGlyphSet();units=source['head'].unitsPerEm
  order=['.notdef']+[f'uni{point:04X}' for point in sorted(mapping)]
  glyphs={};metrics={};scale=.68
  pen=TTGlyphPen(None);glyphs['.notdef']=pen.glyph();metrics['.notdef']=(500,0)
  for point,(base,y) in sorted(mapping.items()):
   name=f'uni{point:04X}';original=cmap[ord(base)];pen=TTGlyphPen(None)
   glyphset[original].draw(TransformPen(Cu2QuPen(pen,max_err=1,reverse_direction=True),(scale,0,0,scale,0,y)))
   glyphs[name]=pen.glyph();metrics[name]=(round(source['hmtx'][original][0]*scale),0)
  fb=FontBuilder(units,isTTF=True);fb.setupGlyphOrder(order);fb.setupCharacterMap({point:f'uni{point:04X}' for point in mapping});fb.setupGlyf(glyphs);fb.setupHorizontalMetrics(metrics)
  fb.setupHorizontalHeader(ascent=source['hhea'].ascent,descent=source['hhea'].descent)
  style='SemiBold' if weight=='medium' else 'Regular'
  fb.setupNameTable({'familyName':'Rongxian Songti Scientific','styleName':style,'uniqueFontIdentifier':'RongxianSongtiScientific-'+style,'fullName':'Rongxian Songti Scientific '+style,'psName':'RongxianSongtiScientific-'+style,'version':'Version 1.000','licenseDescription':'SIL Open Font License 1.1; derived from Source Han Serif SC. See LICENSE.txt.'})
  fb.setupOS2(sTypoAscender=source['OS/2'].sTypoAscender,sTypoDescender=source['OS/2'].sTypoDescender,usWinAscent=source['OS/2'].usWinAscent,usWinDescent=source['OS/2'].usWinDescent,usWeightClass=600 if weight=='medium' else 400)
  fb.setupPost();fb.font['head'].created=fb.font['head'].modified=3800000000
  fb.font.flavor='woff';name=f'print-science-v39-{weight}.woff';fb.save(TARGET/name);files[weight]=name
 manifest['version']='report-v39';manifest['parts'].append({'id':'science','ranges':[[p,p] for p in sorted(mapping)],'files':files})
 (TARGET/'manifest-v39.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
 print(json.dumps({'addedGlyphs':len(mapping),'bytes':sum((TARGET/name).stat().st_size for name in files.values())}))

if __name__=='__main__':main()
