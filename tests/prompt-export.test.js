import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import exporter from '../tools/export-training-prompts.cjs';
import generator from '../backend/generator.cjs';
import contentCheck from '../backend/content-check.cjs';
import figures from '../backend/figure-generation.cjs';
import templates from '../backend/templates.cjs';
import subjectScoring from '../backend/subject-scoring.cjs';
import promptPolicy from '../backend/prompt-policy.cjs';
import documentFormat from '../backend/document-format.cjs';
import teacherBrief from '../backend/teacher-brief.cjs';
import figureGuidance from '../backend/figure-prompt-guidance.cjs';
import modelControl from '../backend/model-control.cjs';

const GEMINI_ROUTE = modelControl.routes.gemini;
const GEMINI = {
  provider: 'gemini',
  model: GEMINI_ROUTE.model,
  protocol: GEMINI_ROUTE.protocol,
  base: GEMINI_ROUTE.url,
  reasoningEffort: 'high',
  effort: 'deep'
};
const STAGES = ['exercise', 'review', 'repair', 'figure-plan', 'figure-review-vector', 'figure-review-pixels', 'figure-review-brief', 'illustration'];
const SUBJECTS = ['语文', '数学', '英语', '日语', '物理', '化学', '生物', '历史', '政治', '地理'];
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

let bundles;
let exportResult;
let tempRoot;

function stop() {
  return Object.assign(new Error('TEST_CAPTURE_ONLY'), { code: 'TEST_CAPTURE_ONLY' });
}

async function capturePlan(subject) {
  const input = exporter.demoInput(subject, { template: 'targeted', visuals: 'auto', questionTypes: false });
  const sheet = exporter.demoSheet(subject, input);
  let raw = null;
  const sentinel = stop();
  try {
    await figures.planFigure(sheet.questions[0], input, {
      generation: GEMINI,
      complete: async prompt => {
        raw = prompt;
        throw sentinel;
      }
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  }
  assert(raw, 'planFigure should call complete');
  return { raw, input };
}

async function captureReview(subject, diagram, { pixels = false } = {}) {
  const input = exporter.demoInput(subject, { template: 'targeted', visuals: 'auto', questionTypes: false });
  const sheet = exporter.demoSheet(subject, input);
  let raw = null;
  const sentinel = stop();
  try {
    await figures.reviewFigure(sheet.questions[0], input, diagram, {
      generation: GEMINI,
      complete: async prompt => {
        raw = prompt;
        throw sentinel;
      }
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  }
  assert(raw, 'reviewFigure should call complete');
  return { raw, input, pixels };
}

before(async () => {
  bundles = await exporter.collectPromptBundles({ now: 0 });
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-export-test-'));
  exportResult = await exporter.exportTrainingPrompts({ outDir: path.join(tempRoot, 'export'), now: 0 });
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test('coverage: 10 subjects, 3 strategies, 4 visual policies, all stages present', () => {
  assert.equal(bundles.length, 181);
  assert.equal(new Set(bundles.map(bundle => bundle.id)).size, bundles.length);
  const outputPaths = bundles.flatMap(bundle => Object.values(exporter.bundlePaths(bundle)));
  assert.equal(new Set(outputPaths).size, outputPaths.length);
  const counts = Object.fromEntries(STAGES.map(stage => [stage, bundles.filter(bundle => bundle.stage === stage).length]));
  assert.deepEqual(counts, {
    exercise: 120,
    review: 10,
    repair: 10,
    'figure-plan': 10,
    'figure-review-vector': 10,
    'figure-review-pixels': 10,
    'figure-review-brief': 10,
    illustration: 1
  });
  assert.deepEqual([...new Set(bundles.map(bundle => bundle.subject))].sort(), [...SUBJECTS].sort());
  for (const subject of SUBJECTS) {
    const demo = exporter.DEMOS[subject];
    assert.equal(demo.targets.length, 3);
    assert.equal(new Set(demo.targets).size, 3);
    for (const template of exporter.STRATEGIES) {
      for (const visuals of exporter.VISUALS) {
        const bundle = bundles.find(item => item.id === `exercise/${subject}/${template}-${visuals}`);
        assert(bundle, `missing exercise/${subject}/${template}-${visuals}`);
        assert.equal(bundle.input.count, 3);
        assert.deepEqual(bundle.input.targets, demo.targets);
      }
    }
    assert(bundles.some(item => item.id === `review/${subject}`));
    assert(bundles.some(item => item.id === `repair/${subject}`));
    for (const suffix of ['plan', 'review-vector', 'review-pixels', 'review-brief']) {
      assert(bundles.some(item => item.id === `figures/${subject}/${suffix}`), `missing figures/${subject}/${suffix}`);
    }
  }
  assert(bundles.some(item => item.stage === 'illustration'));
});

test('exercise prompts are exact current builder output, including template, scoring, format and teacher-brief text', async () => {
  for (const bundle of bundles.filter(item => item.stage === 'exercise')) {
    const built = await generator.buildExercisePrompt(bundle.input, { separateFigures: true });
    assert.equal(bundle.rawSystem, built.system);
    assert.equal(bundle.system, built.system);
    assert.equal(bundle.systemSuffix, '');
    assert.deepEqual(bundle.input, built.input);
    assert.deepEqual(bundle.schema, built.schema);
    assert.equal(bundle.generation.temperature, JSON.parse(built.body).generationConfig.temperature);
    assert.equal(bundle.generation.maxOutputTokens, JSON.parse(built.body).generationConfig.maxOutputTokens);
    assert.equal(bundle.outputReminder, promptPolicy.outputReminder(built));
    const template = templates.templateFor(bundle.subject, bundle.template);
    assert(bundle.system.includes(template.rule), 'template rule must be the real current rule');
    assert(bundle.system.includes(template.strategy.rule), 'strategy rule must be the real current rule');
    assert(bundle.system.includes(subjectScoring.subjectScoringGuide(bundle.subject)), 'subject scoring must come from code');
    assert(bundle.system.includes(teacherBrief.teacherBriefGuide()), 'teacher brief must come from code');
    assert(bundle.system.includes(documentFormat.documentFormatGuide(bundle.subject, { includeExample: true })), 'format guide must come from code');
  }
});

test('visual policy: none has no figure fields; other separate-figure prompts only carry figureRequest', () => {
  for (const bundle of bundles.filter(item => item.stage === 'exercise')) {
    const properties = bundle.schema.properties.questions.items.properties;
    if (bundle.visuals === 'none') {
      assert.equal(Object.hasOwn(properties, 'diagram'), false);
      assert.equal(Object.hasOwn(properties, 'figureRequest'), false);
      assert.match(bundle.system, /本次只用文字与公式/);
      assert.doesNotMatch(bundle.system, /配图为可选/);
    } else {
      assert.equal(Object.hasOwn(properties, 'diagram'), false);
      assert.equal(Object.hasOwn(properties, 'figureRequest'), true);
      if (bundle.visuals === 'auto') assert.match(bundle.system, /自动配图决策/);
      else assert.match(bundle.system, /本次只负责出题与图示委托/);
    }
  }
});

test('fixture sheets are contract-valid but explicitly marked as non-real placeholders', async () => {
  for (const subject of SUBJECTS) {
    const input = exporter.demoInput(subject, { template: 'targeted', visuals: 'auto', questionTypes: false });
    const sheet = exporter.demoSheet(subject, input);
    const validated = await generator.validateOutput(JSON.stringify(sheet), input, { separateFigures: true });
    assert.equal(validated.questions.length, 3);
    assert(validated.questions.every(question => question.stem.includes(exporter.FIXTURE_MARK)));
    assert.deepEqual(input.targets, exporter.DEMOS[subject].targets);
  }
});

test('review prompts are captured through reviewContent options.complete and match the current builder', async () => {
  for (const bundle of bundles.filter(item => item.stage === 'review')) {
    const input = exporter.demoInput(bundle.subject, { template: 'targeted', visuals: 'auto', questionTypes: false });
    const sheet = exporter.demoSheet(bundle.subject, input);
    const raw = await contentCheck.buildReviewPrompt(sheet, input, { separateFigures: true });
    assert.equal(bundle.rawSystem, raw.system);
    assert.deepEqual(bundle.input, raw.input);
    assert.deepEqual(bundle.schema, raw.schema);
    assert(bundle.system.startsWith(raw.system));
    assert(bundle.systemSuffix.includes('输出JSON Schema'));
    assert(bundle.system.includes(contentCheck.SUBJECT_REVIEW_RULES[bundle.subject]));
    assert(bundle.system.includes(contentCheck.REVIEW_DISCLAIMER));
    assert(bundle.input.sheet.questions.every(question => question.stem.includes(exporter.FIXTURE_MARK)));
  }
});

test('repair prompts preserve the original document byte-for-byte and only authorize format repair', async () => {
  for (const bundle of bundles.filter(item => item.stage === 'repair')) {
    const source = bundle.input.repair.originalDocument;
    assert.equal(bundle.input.repair.originalDocument, source);
    assert(source.includes(exporter.FIXTURE_MARK));
    assert.equal(Object.hasOwn(bundle.input.repair, 'candidateDocument'), false);
    const { repair, ...request } = bundle.input;
    const built = await generator.buildRepairPrompt(request, { output: repair.originalDocument, validation: repair.validation }, { separateFigures: true });
    assert.equal(bundle.system, built.system);
    assert.deepEqual(bundle.input, built.input);
    assert.deepEqual(bundle.schema, built.schema);
    assert.equal(bundle.outputReminder, promptPolicy.outputReminder(built));
    assert.match(bundle.system, /最初原稿是所有轮次唯一保真基准/);
    assert.match(bundle.system, /不重新命题/);
    assert.match(bundle.outputReminder, /不重新命题/);
  }
});

test('figure prompts match planFigure/reviewFigure injection and reflect the structured system suffix', async () => {
  for (const subject of SUBJECTS) {
    const planBundle = bundles.find(item => item.id === `figures/${subject}/plan`);
    const plan = await capturePlan(subject);
    assert.equal(planBundle.rawSystem, plan.raw.system);
    assert.deepEqual(planBundle.input, plan.raw.input);
    assert.deepEqual(planBundle.schema, plan.raw.schema);
    assert(planBundle.system.startsWith(plan.raw.system));
    assert(planBundle.systemSuffix.includes('输出JSON Schema'));
    assert(planBundle.system.includes(JSON.stringify(planBundle.schema)));
    assert.equal(planBundle.provenance.fixtureMarker, exporter.FIXTURE_MARK);

    for (const [suffix, diagram, pixels] of [
      ['review-vector', exporter.vectorDiagram(subject), false],
      ['review-pixels', exporter.illustrationDiagram(subject, { pixels: true }), true],
      ['review-brief', exporter.illustrationDiagram(subject), false]
    ]) {
      const bundle = bundles.find(item => item.id === `figures/${subject}/${suffix}`);
      const captured = await captureReview(subject, diagram, { pixels });
      assert.equal(bundle.rawSystem, captured.raw.system);
      assert.deepEqual(bundle.input, captured.raw.input);
      assert.deepEqual(bundle.schema, captured.raw.schema);
      assert(bundle.system.startsWith(captured.raw.system));
      assert(bundle.systemSuffix.includes('输出JSON Schema'));
      if (suffix === 'review-pixels') {
        assert.equal(bundle.image.attached, true);
        assert.equal(bundle.image.dataChars > 0, true);
        assert.equal(Object.hasOwn(bundle.input.diagram, 'image'), false);
        assert.equal(bundleTextHasImageBytes(bundle), false);
      } else {
        assert.equal(bundle.image, null);
      }
    }
  }
});

function bundleTextHasImageBytes(bundle) {
  const text = exporter.bundleText(bundle) + exporter.bundleJson(bundle);
  return /data:image\//.test(text) || /[A-Za-z0-9+/=]{120,}/.test(text);
}

test('illustration prompt is the exact current illustrationPrompt text and contains no image bytes', () => {
  const bundle = bundles.find(item => item.stage === 'illustration');
  assert.equal(bundle.promptText.startsWith('【环节职责与规则优先级】'), true);
  assert.equal(bundle.promptText, requireIllustrationPrompt(bundle));
  assert.match(bundle.promptText, /【横切视角】/);
  assert.equal(bundle.system, null);
  assert.equal(bundle.schema, null);
  assert.equal(bundleTextHasImageBytes(bundle), false);
});

function requireIllustrationPrompt(bundle) {
  return figureGuidance.illustrationPrompt(bundle.input.diagram, { layout: bundle.input.layout });
}

test('manifest and SHA256SUMS cover every exported file with correct hashes', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(exportResult.outDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.staticCompile, true);
  assert.equal(manifest.modelCalls, false);
  assert.equal(manifest.networkAccess, false);
  assert.equal(manifest.credentialsIncluded, false);
  assert.equal(manifest.counts.total, 181);
  assert.equal(manifest.counts.exercise, 120);
  assert.equal(manifest.counts.review, 10);
  assert.equal(manifest.counts.repair, 10);
  assert.equal(manifest.counts.figure, 40);
  assert.equal(manifest.counts.illustration, 1);
  assert.equal(manifest.files.length, 372);
  assert.equal(manifest.versions.templates, templates.version);
  assert.equal(manifest.versions.promptPolicy, promptPolicy.version);

  const manifestPaths = new Set();
  for (const entry of manifest.files) {
    assert.equal(manifestPaths.has(entry.path), false, 'duplicate manifest path ' + entry.path);
    manifestPaths.add(entry.path);
    const bytes = await fs.readFile(path.join(exportResult.outDir, entry.path));
    assert.equal(bytes.length, entry.bytes, 'byte length mismatch ' + entry.path);
    assert.equal(sha256(bytes), entry.sha256, 'sha mismatch ' + entry.path);
  }
  assert(manifestPaths.has('README.md'));
  assert(manifestPaths.has('providers/PROVIDER-BEHAVIOR.md'));
  assert.equal(manifestPaths.has('manifest.json'), false);
  assert.equal(manifestPaths.has('SHA256SUMS.txt'), false);

  const sums = (await fs.readFile(path.join(exportResult.outDir, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n');
  const sumMap = new Map();
  for (const line of sums) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    assert(match, 'bad SHA256SUMS line: ' + line);
    assert.equal(sumMap.has(match[2]), false, 'duplicate sum path ' + match[2]);
    sumMap.set(match[2], match[1]);
  }
  assert.equal(sumMap.size, manifest.files.length + 1);
  for (const entry of manifest.files) {
    assert.equal(sumMap.get(entry.path), entry.sha256);
  }
  const manifestBytes = await fs.readFile(path.join(exportResult.outDir, 'manifest.json'));
  assert.equal(sumMap.get('manifest.json'), sha256(manifestBytes));
  for (const [relative, expected] of sumMap) {
    const bytes = await fs.readFile(path.join(exportResult.outDir, relative));
    assert.equal(sha256(bytes), expected, 'sum mismatch ' + relative);
  }
});

test('export refuses an existing directory and never overwrites its contents', async () => {
  const second = path.join(tempRoot, 'second');
  await exporter.exportTrainingPrompts({ outDir: second, now: 0 });
  const before = await fs.readFile(path.join(second, 'README.md'));
  await assert.rejects(
    exporter.exportTrainingPrompts({ outDir: second, now: 1 }),
    error => error.code === 'EXPORT_DIR_EXISTS' || /已存在/.test(error.message)
  );
  assert.deepEqual(await fs.readFile(path.join(second, 'README.md')), before);

  const occupied = path.join(tempRoot, 'occupied');
  await fs.mkdir(occupied);
  const sentinel = path.join(occupied, 'keep.txt');
  await fs.writeFile(sentinel, 'keep', 'utf8');
  await assert.rejects(
    exporter.exportTrainingPrompts({ outDir: occupied, now: 0 }),
    error => error.code === 'EXPORT_DIR_EXISTS' || /已存在/.test(error.message)
  );
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'keep');
  await assert.rejects(exporter.exportTrainingPrompts({ outDir: 'relative/path', now: 0 }), /绝对路径/);
});

test('provider artifacts record Gemini tails, Kimi schema adaptation and unchanged official payload text', async () => {
  const out = exportResult.outDir;
  const sample = bundles.find(bundle => bundle.id === 'exercise/数学/targeted-auto');
  const reminders = JSON.parse(await fs.readFile(path.join(out, 'providers/output-reminders.json'), 'utf8'));
  assert.match(reminders.reminders.exercise.text, /choices:\[\]/);
  assert.match(reminders.reminders.exercise.text, /图示按本次Schema/);
  assert.match(reminders.reminders.repair.text, /不重新命题/);
  assert.doesNotMatch(reminders.reminders.review.text, /choices:\[\]/);
  assert.doesNotMatch(reminders.reminders.figurePlan.text, /choices:\[\]/);
  assert.doesNotMatch(reminders.reminders.figureReview.text, /choices:\[\]/);
  assert.match(reminders.legacyDirectNote, /不追加 outputReminder/);
  assert.match(reminders.kimiNote, /不追加 outputReminder/);

  const kimiSchema = JSON.parse(await fs.readFile(path.join(out, 'providers/kimi-schema.json'), 'utf8'));
  assert(kimiSchema.branchChanges.length > 0);
  assert(kimiSchema.branchChanges.every(change => change.typeBefore === null && change.typeAfter === 'object'));

  const kimiPayload = JSON.parse(await fs.readFile(path.join(out, 'providers/kimi-exercise-payload.json'), 'utf8')).payload;
  assert.equal(kimiPayload.response_format.type, 'json_schema');
  assert.equal(kimiPayload.messages[0].content, sample.system);
  assert.deepEqual(JSON.parse(kimiPayload.messages[1].content), sample.input);
  assert.equal(kimiPayload.messages.length, 2);
  assert.equal(kimiPayload.response_format.json_schema.schema.properties.questions.items.anyOf.every(branch => branch.type === 'object'), true);

  const gemini = JSON.parse(await fs.readFile(path.join(out, 'providers/gemini-exercise-payload.json'), 'utf8')).payload;
  assert.equal(gemini.systemInstruction.parts[0].text, sample.system);
  assert.deepEqual(JSON.parse(gemini.contents[0].parts[0].text), sample.input);
  assert.equal(gemini.contents[0].parts.at(-1).text, sample.outputReminder);
  assert.deepEqual(gemini.generationConfig.responseJsonSchema, sample.schema);

  const responses = JSON.parse(await fs.readFile(path.join(out, 'providers/official-responses-payload.json'), 'utf8')).payload;
  assert.equal(responses.input[0].content[0].text, sample.system);
  assert.equal(responses.input[1].content[0].text, JSON.stringify(sample.input));
  assert.equal(Object.hasOwn(responses, 'response_format'), false);

  const chat = JSON.parse(await fs.readFile(path.join(out, 'providers/official-chat-payload.json'), 'utf8')).payload;
  assert.equal(chat.messages[0].content, sample.system);
  assert.equal(chat.messages[1].content, JSON.stringify(sample.input));
  assert.equal(Object.hasOwn(chat, 'response_format'), false);

  const anthropic = JSON.parse(await fs.readFile(path.join(out, 'providers/official-anthropic-payload.json'), 'utf8')).payload;
  assert.equal(anthropic.system, sample.system);
  assert.equal(anthropic.messages[0].content[0].text, JSON.stringify(sample.input));

  const openai = JSON.parse(await fs.readFile(path.join(out, 'providers/openai-chatgpt-payload.json'), 'utf8')).payload;
  assert.equal(openai.instructions, sample.system);
  assert.equal(openai.input[0].content[0].text, JSON.stringify(sample.input));
});

test('no exported file contains credentials, auth headers or image bytes', async () => {
  const forbidden = /(?:^|[^A-Za-z])(?:authorization|bearer|x-goog-api-key|api[_-]?key|credentialRef|secret|password)(?![A-Za-z])/i;
  for (const entry of exportResult.files) {
    const text = await fs.readFile(path.join(exportResult.outDir, entry.path), 'utf8');
    assert.doesNotMatch(text, forbidden, 'credential-like text in ' + entry.path);
    assert.doesNotMatch(text, /data:image\//, 'data image in ' + entry.path);
    assert.doesNotMatch(text, /[A-Za-z0-9+/=]{120,}/, 'possible embedded base64 in ' + entry.path);
    assert.doesNotMatch(text, /sk-[A-Za-z0-9]{8,}/, 'possible secret key in ' + entry.path);
  }
});

test('readme is the guide plus a generated index; docs identify the static-compile boundaries', async () => {
  const guide = await fs.readFile(new URL('../docs/PROMPT-EXPORT-2026-10-21.md', import.meta.url), 'utf8');
  for (const phrase of ['静态编译', '【待填原题】', 'outputReminder', 'kimiExerciseSchema', 'separateFigures', 'SHA256', '不会用摘要替代原文']) {
    assert(guide.includes(phrase), 'guide missing ' + phrase);
  }
  const readme = await fs.readFile(path.join(exportResult.outDir, 'README.md'), 'utf8');
  assert(readme.includes('<!-- GENERATED-EXPORT-INDEX -->'));
  assert(readme.includes('exercise/语文/targeted-auto/prompt.txt'));
  assert(readme.includes('review/物理/review.json'));
  assert(readme.includes('providers/PROVIDER-BEHAVIOR.md'));
  assert(readme.includes('| 语文 | 12 |'));
  assert(readme.indexOf('<!-- GENERATED-EXPORT-INDEX -->') > readme.indexOf('# 训练提示词静态导出'));
});

test('exported text names the fixture provenance and does not claim actual model or exam provenance', () => {
  const exercise = bundles.find(bundle => bundle.id === 'exercise/物理/targeted-auto');
  const text = exporter.bundleText(exercise);
  assert.match(text, /匿名教师演示配置/);
  assert.match(text, /不来自原表、真实学生或真实考试/);
  assert.match(text, /static-compile: true/);
  assert.match(text, /model-call: false/);
  assert.match(text, /===== SYSTEM 原文/);
  assert.match(text, /===== USER INPUT 示例/);
  assert.match(text, /===== OUTPUT SCHEMA/);
  assert.equal(exercise.provenance.sourceTable, false);
  assert.equal(exercise.provenance.realStudent, false);
  assert.equal(exercise.provenance.realExam, false);
  for (const subject of SUBJECTS) {
    const review = bundles.find(bundle => bundle.id === `review/${subject}`);
    assert(review.input.sheet.questions.every(question => question.stem.includes('【待填原题】')));
    const repair = bundles.find(bundle => bundle.id === `repair/${subject}`);
    assert(repair.input.repair.originalDocument.includes('【待填原题】'));
  }
});
