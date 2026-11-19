# Jianwei Observatory · Assessment Research Workspace

[中文说明](README.md) · [Main workspace](https://yusheng266186-beep.github.io/jianwei-observatory/) · [Technical docs](docs/README.md)

Jianwei is a teaching workspace for studying evidence in local assessment materials. It follows a question from a cohort or classroom to a subject, paper, item, or student, then records findings, reports, and follow-up work.

## First workflow

1. Import an authorized workbook or CSV, or restore a Jianwei JSON backup. Check the import summary, column mapping, exam identifiers, and record counts before interpreting results.
2. Pick the scope for the question. Cohort Overview and Class Research show group-level patterns. Paper Research traces item results and knowledge points. Student Research combines history, subjects, and item evidence.
3. Save a research folder to reopen a view at its selected exam and position. Save an evidence excerpt to retain the results and teacher interpretation as they appeared at that moment.
4. Plan an intervention or reassessment in Teaching Follow-up. In the Exercise Center, review generated exercises, answers, and figures before sending them to students. Use the report or exercise export appropriate to the audience.

## Input, privacy, and deployment

- Use <code>.xlsx</code>, <code>.xls</code>, <code>.csv</code>, or a Jianwei full JSON backup. General Excel and CSV imports support column mapping. Preserve missing values and measured zeroes as separate states.
- Materials and research work are kept in the browser. Transfer them through the full backup on an authorized device. Inspect exports before sharing them.
- AI exercise generation is an optional, teacher-authorized service call. The cloud training service receives the minimized training brief. Cloud setup, allowed data, and account administration are covered by the Chinese maintainer guide.
- The public Pages workspace is published from <code>main</code>. The [Gemini branch preview](https://github.com/yusheng266186-beep/jianwei-observatory-preview) is a separate historical deployment with its own browser storage.

## Local development

Use Node.js 22.9 or later, npm, and Python 3. From the repository root:

~~~bash
npm ci
npm run build
python3 -m http.server 4175 --bind 127.0.0.1
~~~

Open <http://127.0.0.1:4175/>. Changes to source in <code>app/</code>, <code>assets/</code>, or <code>styles/</code> need a rebuild because the page loads content-hashed output.

| Check | Purpose |
| --- | --- |
| <code>npm run package:training -- --check</code> | Check the front-end and cloud training contract |
| <code>npm run runtime:check</code> | Audit the runtime asset inventory |
| <code>node tools/check-release.cjs</code> | Validate public entry points and referenced assets |
| <code>AUDIT_URL=http://127.0.0.1:4175 npm run test:smoke</code> | Run the browser smoke flow against a local server |

Start architecture work with [ARCHITECTURE.md](docs/ARCHITECTURE.md); bundled component terms are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
