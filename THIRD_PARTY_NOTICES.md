# Third-party notices

The project serves the following libraries and fonts locally. Their retained license files and bundled notices remain part of the published site.

| Component | Local files | License |
| --- | --- | --- |
| SheetJS Community Edition 0.20.3 | `vendor/xlsx.full.min.js` | Apache License 2.0; [upstream](https://sheetjs.com/) |
| JSZip 3.10.1 | `vendor/jszip.min.js` | MIT or GPLv3, used under MIT; bundled notices also identify embedded dependencies; [upstream](https://github.com/Stuk/jszip) |
| pdfmake 0.2.20 | `vendor/pdfmake.min.js`, `vendor/pdfmake-LICENSE.txt` | MIT; [upstream](https://github.com/bpampuch/pdfmake) |
| PDF.js 4.10.38 | `vendor/pdfjs/`, `vendor/pdfjs/LICENSE` | Apache License 2.0; [upstream](https://github.com/mozilla/pdf.js) |
| MathJax 3.2.2 including its bundled extensions | `vendor/mathjax-3.2.2/`, `vendor/mathjax-3.2.2/LICENSE` | Apache License 2.0; [upstream](https://github.com/mathjax/MathJax) |
| Source Han Serif SC derived reading and report subsets | `assets/fonts/reading-*`, `assets/report-fonts/`; licenses at `assets/fonts/reading-LICENSE.txt` and `assets/report-fonts/LICENSE.txt` | SIL Open Font License 1.1; locally renamed reading/report families, with system font fallbacks; [upstream](https://github.com/adobe-fonts/source-han-serif) |

Libraries read/export workbooks, create DOCX archives, render mathematical notation, generate PDFs and display PDF previews. Font subsets support the reading interface and Songti document output. No external font service or analytics service is requested by the application.

Development dependencies are declared and pinned in `package.json` and `package-lock.json`; esbuild builds the static runtime, and Playwright supports separate browser regression scripts. These development packages are not shipped as the site's runtime.
