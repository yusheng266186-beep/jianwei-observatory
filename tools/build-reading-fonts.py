"""Create self-hosted OFL font subsets from static UI and public GB2312.

Requires fontTools and brotli. Source TTF/TTC files stay outside the repository;
no uploaded workbooks, student names or private datasets are read.
"""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
import json

root=Path(__file__).resolve().parents[1]
sources=root/'.audit-output/font-sources'
ui=''.join(p.read_text() for p in (root/'app').rglob('*.js'))+(root/'index.html').read_text()
core={ord(c) for c in ui if not c.isspace()}|set(range(32,127))
levels=[]
for first_range in [range(0xB0,0xD8),range(0xD8,0xF8)]:
 chars=set()
 for high in first_range:
  for low in range(0xA1,0xFF):
   try:chars.add(ord(bytes([high,low]).decode('gb2312')))
   except UnicodeDecodeError:pass
 levels.append(chars-core)

def ranges(codepoints):
 result=[];start=end=None
 for value in sorted(codepoints):
  if start is not None and value==end+1:end=value
  else:
   if start is not None:result.append(f'U+{start:X}'+(f'-{end:X}' if end!=start else ''))
   start=end=value
 if start is not None:result.append(f'U+{start:X}'+(f'-{end:X}' if end!=start else ''))
 return ','.join(result)

css=[];manifest=[]
for kind,family,source,number in [('serif','Rongxian Reading Serif',Path('/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc'),2),('copy','Rongxian Reading Copy',sources/'wenkai-regular.ttf',-1)]:
 for section,wanted in [('core',core),('common',levels[0]),('extended',levels[1])]:
  font=TTFont(source,fontNumber=number);available=set(font.getBestCmap());chars=wanted&available
  options=subset.Options();options.layout_features=['*'];options.layout_languages=['ZHS','dflt'];options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*'];options.hinting=False
  selection=subset.Subsetter(options=options);selection.populate(unicodes=chars);selection.subset(font)
  names={1:family,2:'Regular',3:family+'-Subset-1',4:family,6:family.replace(' ','')+'-Regular',16:family,17:'Regular'}
  for record in font['name'].names:
   if record.nameID in names:record.string=names[record.nameID].encode(record.getEncoding(),errors='replace')
  if 'CFF ' in font:
   cff=font['CFF '].cff;postscript=family.replace(' ','')+'-Regular';cff.fontNames=[postscript]
   for top in cff.topDictIndex:
    top.FamilyName=family;top.FullName=family
    if hasattr(top,'FDArray'):
     for private_font in top.FDArray:
      if hasattr(private_font,'FontName'):private_font.FontName=postscript
  font.flavor='woff2';filename=f'reading-{kind}-{section}.woff2';dest=root/'assets/fonts'/filename;font.save(dest);font.close()
  css.append(f"@font-face{{font-family:'{family}';src:url('../assets/fonts/{filename}?v=type-v15') format('woff2');font-weight:400;font-style:normal;font-display:swap;unicode-range:{ranges(chars)}}}")
  manifest.append({'file':filename,'family':family,'section':section,'glyphs':len(chars),'bytes':dest.stat().st_size})
  print(filename,len(chars),'glyphs',dest.stat().st_size,'bytes')
(root/'styles/reading-fonts.css').write_text('/* OFL subsets: static UI core, GB2312 common and extended characters. */\n'+'\n'.join(css)+'\n')
(root/'assets/fonts/reading-LICENSE.txt').write_text('Noto Serif CJK / subset family Rongxian Reading Serif\nSource: https://github.com/notofonts/noto-cjk/tree/main/Serif\nCopyright © 2017-2024 Adobe (http://www.adobe.com/).\n\n'+(sources/'serif-license.txt').read_text()+'\n\nLXGW WenKai 1.522 / subset family Rongxian Reading Copy\nSource: https://github.com/lxgw/LxgwWenKai/releases/tag/v1.522\n\n'+(sources/'wenkai-license.txt').read_text())
(root/'assets/fonts/reading-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

# Preserve license text while normalizing trailing whitespace.
license_file=root/'assets/fonts/reading-LICENSE.txt'
license_file.write_text('\n'.join(line.rstrip() for line in license_file.read_text().splitlines())+'\n')
