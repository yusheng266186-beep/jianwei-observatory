'use strict';
// Static training-prompt exporter.
//
// This tool calls the repository's real prompt builders and adapters, but never
// opens a network connection and never needs a provider credential. The only
// network-shaped code it exercises is the provider adapter with an injected
// transport that throws a private sentinel after the request body has been
// assembled. Exported text is never rewritten or summarised in place of the
// builder's text.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {execFileSync} = require('node:child_process');

const generator = require('../backend/generator.cjs');
const templates = require('../backend/templates.cjs');
const contentCheck = require('../backend/content-check.cjs');
const figures = require('../backend/figure-generation.cjs');
const completion = require('../backend/model-completion.cjs');
const modelControl = require('../backend/model-control.cjs');
const kimi = require('../backend/kimi.cjs');
const adapter = require('../backend/model-adapter.cjs');
const promptPolicy = require('../backend/prompt-policy.cjs');
const subjectScoring = require('../backend/subject-scoring.cjs');
const { illustrationPrompt } = require('../backend/figure-prompt-guidance.cjs');
const providers = require('../backend/providers.json');

const FORMAT = 'jianwei-training-prompt-export/v1';
const TOOL = 'tools/export-training-prompts.cjs';
const CAPTURE_KEY = 'static-export-capture-only-not-a-credential';
const CAPTURE_CODE = 'STATIC_EXPORT_CAPTURE_ONLY';
const GEMINI_ROUTE = modelControl.routes.gemini;
const GEMINI = Object.freeze({
  provider: 'gemini',
  model: GEMINI_ROUTE.model,
  protocol: GEMINI_ROUTE.protocol,
  base: GEMINI_ROUTE.url,
  reasoningEffort: 'high',
  effort: 'deep'
});
const STRATEGIES = ['targeted', 'variation', 'retest'];
const VISUALS = ['auto', 'none', 'vector', 'hybrid'];
const FIXTURE_MARK = '【待填原题】';
const SUBJECT_ORDER = templates.summary().subjects.map(row => row.subject);

const DEMOS = {
  '语文': {
    focus: '现代文阅读信息筛选与语言表达',
    curriculum: '高中语文现代文阅读与语言文字运用',
    targets: ['信息筛选与概括', '论证分析', '语言表达'],
    questionTypes: ['选择', '简答'],
    sheetType: '简答',
    figurePrecision: 'illustrative'
  },
  '数学': {
    focus: '函数与导数综合应用',
    curriculum: '高中数学函数、导数与不等式',
    targets: ['函数单调性', '导数应用', '参数范围'],
    questionTypes: ['选择', '解答'],
    sheetType: '解答',
    figurePrecision: 'exact'
  },
  '英语': {
    focus: '阅读与语法填空',
    curriculum: '高中英语阅读与语法',
    targets: ['阅读理解', '语法填空', '词汇辨析'],
    questionTypes: ['选择', '填空'],
    sheetType: '填空',
    figurePrecision: 'illustrative'
  },
  '日语': {
    focus: '语篇中的助词与表达',
    curriculum: '高中日语语法与阅读',
    targets: ['助词辨析', '语篇填空', '阅读理解'],
    questionTypes: ['选择', '填空'],
    sheetType: '填空',
    figurePrecision: 'illustrative'
  },
  '物理': {
    focus: '匀变速运动与实验分析',
    curriculum: '高中物理运动学与力学实验',
    targets: ['匀变速直线运动', '牛顿第二定律', '实验数据处理'],
    questionTypes: ['选择', '计算'],
    sheetType: '计算',
    figurePrecision: 'exact'
  },
  '化学': {
    focus: '反应原理与实验探究',
    curriculum: '高中化学反应原理与实验',
    targets: ['氧化还原反应', '实验装置与气路', '定量计算'],
    questionTypes: ['选择', '实验'],
    sheetType: '实验',
    figurePrecision: 'exact'
  },
  '生物': {
    focus: '遗传分析与实验探究',
    curriculum: '高中生物遗传与实验',
    targets: ['遗传规律', '实验设计', '光合作用'],
    questionTypes: ['选择', '实验'],
    sheetType: '实验',
    figurePrecision: 'illustrative'
  },
  '历史': {
    focus: '史料阅读与制度演变',
    curriculum: '高中历史史料阅读与制度史',
    targets: ['史料实证', '制度演变', '历史解释'],
    questionTypes: ['选择', '简答'],
    sheetType: '简答',
    figurePrecision: 'illustrative'
  },
  '政治': {
    focus: '概念辨析与材料论证',
    curriculum: '高中思想政治经济与社会',
    targets: ['概念辨析', '材料论证', '逻辑传导'],
    questionTypes: ['选择', '简答'],
    sheetType: '简答',
    figurePrecision: 'illustrative'
  },
  '地理': {
    focus: '区域过程与图表分析',
    curriculum: '高中地理区域分析与图表',
    targets: ['区域定位', '过程分析', '图表判读'],
    questionTypes: ['选择', '简答'],
    sheetType: '简答',
    figurePrecision: 'illustrative'
  }
};

const PROVENANCE = Object.freeze({
  kind: 'anonymous-teacher-demo-config',
  sourceTable: false,
  realStudent: false,
  realExam: false,
  fixtureMarker: FIXTURE_MARK,
  note: '所有样例均为匿名教师演示配置，不是原表、真实学生或真实考试；标注'+FIXTURE_MARK+'的题目不是真实试题。'
});

function sentinel() {
  return Object.assign(new Error(CAPTURE_CODE), { code: CAPTURE_CODE });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function clone(value) {
  return structuredClone(value);
}

function demoInput(subject, { template = 'targeted', visuals = 'auto', questionTypes = true } = {}) {
  const demo = DEMOS[subject];
  if (!demo) throw new Error('UNKNOWN_SUBJECT:' + subject);
  const input = {
    subject,
    grade: '高三',
    examStyle: 'sichuan-gaokao',
    answerSpaceVersion: 1,
    curriculum: demo.curriculum,
    focus: demo.focus,
    count: 3,
    minutes: 20,
    difficulty: '基础巩固',
    evidence: [],
    basis: { mode: 'manual', examCount: 0, weakPoints: [] },
    targets: [...demo.targets],
    requirements: '每题标注分值，主观题给出可核对的评分点。',
    template,
    visuals
  };
  if (questionTypes) input.questionTypes = [...demo.questionTypes];
  return input;
}

function demoFigureRequest(subject) {
  const demo = DEMOS[subject];
  return {
    caption: FIXTURE_MARK + subject + '图示委托占位',
    requirements: FIXTURE_MARK + '只呈现题干已给的结构、连接或数据关系，不画出待求答案。',
    knownData: FIXTURE_MARK + '已知条件占位，不是真实试题数据。',
    labels: ['A', 'B'],
    precision: demo.figurePrecision,
    placement: { after: FIXTURE_MARK + '题干引图句占位。', width: 'standard', aspect: 'wide' }
  };
}

function demoSheet(subject, input) {
  const demo = DEMOS[subject];
  const scoring = subjectScoring.exampleScoring(subject, demo.sheetType);
  return {
    title: FIXTURE_MARK + subject + '教师演示题组（非真实试题）',
    objective: FIXTURE_MARK + '匿名教师演示配置：' + input.focus,
    questions: input.targets.map((target, index) => ({
      id: index + 1,
      level: index === 0 ? '基础' : '巩固',
      type: demo.sheetType,
      target,
      stem: FIXTURE_MARK + '第' + (index + 1) + '题（教师演示占位，不是真实试题）：围绕“' + target + '”作答。' + (index === 0 ? '\n' + FIXTURE_MARK + '题干引图句占位。' : ''),
      choices: [],
      answer: FIXTURE_MARK + '答案占位：第' + (index + 1) + '题参考作答，不是真实试题。',
      analysis: FIXTURE_MARK + '解析占位：第' + (index + 1) + '题分析，不是真实试题。',
      points: [FIXTURE_MARK + '评分点占位：' + scoring.points[0]],
      maxScore: scoring.maxScore,
      minutes: 6,
      answerLines: demo.sheetType === '填空' ? 0 : 6,
      ...(index === 0 ? { figureRequest: demoFigureRequest(subject) } : {})
    }))
  };
}

function fixturePng() {
  const width = 64, height = 64;
  const chunk = (type, data) => {
    const name = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([name, data])) >>> 0, 0);
    return Buffer.concat([length, name, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = (x + y) % 2 ? 210 : 245;
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
  return { mime: 'image/png', data: png.toString('base64') };
}

function vectorDiagram(subject) {
  return {
    kind: 'drawing',
    caption: FIXTURE_MARK + subject + '矢量核对占位图',
    description: FIXTURE_MARK + '仅呈现题干已给的线段与标签，不表示真实试题。',
    scene: [
      { type: 'path', d: 'M 100 100 L 300 100 L 300 240' },
      { type: 'text', x: 200, y: 80, text: 'A' }
    ]
  };
}

function illustrationDiagram(subject, { pixels = false } = {}) {
  return {
    kind: 'illustration',
    caption: FIXTURE_MARK + subject + '复杂外观核对占位图',
    description: FIXTURE_MARK + '仅呈现题干已给的外观结构，不承担定量关系，不表示真实试题。',
    ...(pixels ? { image: fixturePng() } : {})
  };
}

function summarizeGeminiBody(body, prompt, extra = {}) {
  const system = (body.systemInstruction?.parts || []).map(part => part.text || '').join('\n');
  const parts = body.contents?.[0]?.parts || [];
  const textParts = parts.filter(part => typeof part.text === 'string');
  const input = JSON.parse(textParts[0]?.text || 'null');
  const outputReminder = textParts.at(-1)?.text || '';
  const inline = parts.find(part => part.inlineData)?.inlineData || null;
  return {
    system,
    rawSystem: prompt.system || '',
    systemSuffix: prompt.system && system.startsWith(prompt.system) ? system.slice(prompt.system.length) : '',
    input,
    schema: body.generationConfig?.responseJsonSchema || null,
    generation: body.generationConfig ? {
      temperature: body.generationConfig.temperature ?? null,
      maxOutputTokens: body.generationConfig.maxOutputTokens ?? null,
      responseMimeType: body.generationConfig.responseMimeType ?? null,
      thinkingConfig: body.generationConfig.thinkingConfig ? clone(body.generationConfig.thinkingConfig) : null
    } : null,
    outputReminder,
    image: {
      attached: !!inline,
      mimeType: inline?.mimeType || null,
      dataChars: inline?.data?.length || 0
    },
    body,
    ...extra
  };
}

async function captureGeminiBody(prompt) {
  let captured = null;
  const stop = sentinel();
  try {
    await completion.completeGemini(prompt, GEMINI, {
      key: CAPTURE_KEY,
      transport: async (_url, options) => {
        captured = JSON.parse(options.body);
        throw stop;
      }
    });
  } catch (error) {
    if (error !== stop) throw error;
  }
  if (!captured) throw new Error('STATIC_EXPORT_CAPTURE_FAILED');
  return summarizeGeminiBody(captured, prompt);
}

async function captureStructuredPrompt(prompt) {
  let captured = null;
  const stop = sentinel();
  try {
    await figures.structured(prompt, {
      generation: GEMINI,
      key: CAPTURE_KEY,
      transport: async (_url, options) => {
        captured = JSON.parse(options.body);
        throw stop;
      }
    });
  } catch (error) {
    if (error !== stop) throw error;
  }
  if (!captured) throw new Error('STATIC_EXPORT_CAPTURE_FAILED');
  return summarizeGeminiBody(captured, prompt);
}

function baseBundle(fields) {
  const createdAt = fields.createdAt;
  return {
    format: FORMAT,
    id: fields.id,
    stage: fields.stage,
    title: fields.title,
    builder: fields.builder,
    source: fields.source,
    subject: fields.subject,
    template: fields.template || null,
    visuals: fields.visuals || null,
    createdAt,
    provenance: clone(PROVENANCE),
    systemSource: fields.systemSource,
    rawSystem: fields.rawSystem ?? null,
    system: fields.system ?? null,
    systemSuffix: fields.systemSuffix || '',
    input: fields.input,
    schema: fields.schema ?? null,
    generation: fields.generation || null,
    outputReminder: fields.outputReminder || '',
    promptText: fields.promptText ?? null,
    image: fields.image || null,
    kimi: fields.kimi || null,
    notes: [
      '静态编译，不是实际模型调用；未访问任何网络或凭据。',
      '样例来源：匿名教师演示配置，不来自原表、真实学生或真实考试。',
      'builder 自带的“输出形状”或字段示例是字段示意，不是试题；本工具 fixture 题目均带'+FIXTURE_MARK+'。',
      ...(fields.notes || [])
    ]
  };
}

async function exerciseBundles(createdAt) {
  const out = [];
  for (const subject of SUBJECT_ORDER) {
    for (const template of STRATEGIES) {
      for (const visuals of VISUALS) {
        const input = demoInput(subject, { template, visuals });
        const prompt = await generator.buildExercisePrompt(input, { separateFigures: true });
        const actual = await captureGeminiBody(prompt);
        out.push(baseBundle({
          id: 'exercise/' + subject + '/' + template + '-' + visuals,
          stage: 'exercise',
          title: subject + ' · ' + template + ' · ' + visuals + ' 出题提示词',
          builder: 'generator.buildExercisePrompt',
          source: { builder: 'generator.buildExercisePrompt', options: { separateFigures: true } },
          subject,
          template,
          visuals,
          createdAt,
          systemSource: 'builder',
          rawSystem: prompt.system,
          system: actual.system,
          input: actual.input,
          schema: actual.schema,
          generation: actual.generation,
          outputReminder: actual.outputReminder,
          kimi: { schemaAdapted: JSON.stringify(kimi.kimiExerciseSchema(actual.schema)) !== JSON.stringify(actual.schema) },
          notes: [
            '策略=' + prompt.template.id + '；学科模板版本=' + prompt.template.version + '。',
            'separateFigures=true：出题阶段只生成 figureRequest，图示由独立环节完成。',
            visuals === 'none' ? 'visuals=none：Schema 不含 diagram 或 figureRequest。' : 'Schema 只含 figureRequest，不含 diagram。'
          ]
        }));
      }
    }
  }
  return out;
}

async function reviewBundle(subject, createdAt) {
  const input = demoInput(subject, { template: 'targeted', visuals: 'auto', questionTypes: false });
  const sheet = demoSheet(subject, input);
  let raw = null;
  let actual = null;
  const stop = sentinel();
  try {
    await contentCheck.reviewContent(clone(sheet), clone(input), {
      separateFigures: true,
      complete: async prompt => {
        raw = prompt;
        actual = await captureStructuredPrompt(prompt);
        throw stop;
      }
    });
  } catch (error) {
    if (error !== stop) throw error;
  }
  if (!raw || !actual) throw new Error('STATIC_EXPORT_CAPTURE_FAILED');
  return baseBundle({
    id: 'review/' + subject,
    stage: 'review',
    title: subject + ' · 内容复核提示词',
    builder: 'content-check.buildReviewPrompt',
    source: { builder: 'content-check.buildReviewPrompt', invokedBy: 'content-check.reviewContent', options: { separateFigures: true } },
    subject,
    createdAt,
    systemSource: 'builder+structured',
    rawSystem: raw.system,
    system: actual.system,
    systemSuffix: actual.systemSuffix,
    input: actual.input,
    schema: actual.schema,
    generation: actual.generation,
    outputReminder: actual.outputReminder,
    kimi: { schemaAdapted: JSON.stringify(kimi.kimiExerciseSchema(actual.schema)) !== JSON.stringify(actual.schema) },
    notes: [
      '复核输入使用'+FIXTURE_MARK+'占位题组，不是真实试题。',
      '通过 reviewContent 的 options.complete 注入捕获，未走网络。',
      'structured 在 system 末尾追加输出 Schema 说明；实际 system 见上方原文。'
    ]
  });
}

async function repairBundle(subject, createdAt) {
  const input = demoInput(subject, { template: 'targeted', visuals: 'auto', questionTypes: false });
  const sheet = demoSheet(subject, input);
  const source = JSON.stringify(sheet);
  const prompt = await generator.buildRepairPrompt(input, {
    output: source,
    validation: FIXTURE_MARK + '格式诊断占位：第1题字段形状不符合示例契约。'
  }, { separateFigures: true });
  const actual = await captureGeminiBody(prompt);
  return baseBundle({
    id: 'repair/' + subject,
    stage: 'repair',
    title: subject + ' · 格式修复提示词',
    builder: 'generator.buildRepairPrompt',
    source: { builder: 'generator.buildRepairPrompt', options: { separateFigures: true } },
    subject,
    createdAt,
    systemSource: 'builder',
    rawSystem: prompt.system,
    system: actual.system,
    input: actual.input,
    schema: actual.schema,
    generation: actual.generation,
    outputReminder: actual.outputReminder,
    kimi: { schemaAdapted: JSON.stringify(kimi.kimiExerciseSchema(actual.schema)) !== JSON.stringify(actual.schema) },
    notes: [
      'repair.originalDocument 与 fixture 原稿逐字一致；保真基准不被改写。',
      '修复只处理格式，不重新命题；示例诊断不是真实模型诊断。'
    ]
  });
}

async function figureBundles(createdAt) {
  const out = [];
  for (const subject of SUBJECT_ORDER) {
    const input = demoInput(subject, { template: 'targeted', visuals: 'auto', questionTypes: false });
    const sheet = demoSheet(subject, input);
    const question = sheet.questions[0];

    let rawPlan = null;
    let actualPlan = null;
    const planStop = sentinel();
    try {
      await figures.planFigure(question, input, {
        generation: GEMINI,
        complete: async prompt => {
          rawPlan = prompt;
          actualPlan = await captureStructuredPrompt(prompt);
          throw planStop;
        }
      });
    } catch (error) {
      if (error !== planStop) throw error;
    }
    if (!rawPlan || !actualPlan) throw new Error('STATIC_EXPORT_CAPTURE_FAILED');
    out.push(baseBundle({
      id: 'figures/' + subject + '/plan',
      stage: 'figure-plan',
      title: subject + ' · 图示规划提示词',
      builder: 'figure-generation.planFigure',
      source: { builder: 'figure-generation.planFigure', options: { visuals: input.visuals } },
      subject,
      createdAt,
      systemSource: 'builder+structured',
      rawSystem: rawPlan.system,
      system: actualPlan.system,
      systemSuffix: actualPlan.systemSuffix,
      input: actualPlan.input,
      schema: actualPlan.schema,
      generation: actualPlan.generation,
      outputReminder: actualPlan.outputReminder,
      notes: [
        '输入题目含'+FIXTURE_MARK+'占位，不是真实试题。',
        'structured 在 system 末尾追加输出 Schema 说明；实际 system 见上方原文。'
      ]
    }));

    for (const review of [
      { suffix: 'review-vector', stage: 'figure-review-vector', label: '矢量核对', diagram: vectorDiagram(subject), options: { generation: GEMINI } },
      { suffix: 'review-pixels', stage: 'figure-review-pixels', label: '像素核对', diagram: illustrationDiagram(subject, { pixels: true }), options: { generation: GEMINI } },
      { suffix: 'review-brief', stage: 'figure-review-brief', label: '无像素委托核对', diagram: illustrationDiagram(subject), options: { generation: GEMINI } }
    ]) {
      let rawReview = null;
      let actualReview = null;
      const stop = sentinel();
      try {
        await figures.reviewFigure(question, input, review.diagram, {
          ...review.options,
          complete: async prompt => {
            rawReview = prompt;
            actualReview = await captureStructuredPrompt(prompt);
            throw stop;
          }
        });
      } catch (error) {
        if (error !== stop) throw error;
      }
      if (!rawReview || !actualReview) throw new Error('STATIC_EXPORT_CAPTURE_FAILED');
      if (review.suffix === 'review-pixels' && !actualReview.image.attached) throw new Error('PIXEL_REVIEW_CAPTURE_MISSING_IMAGE');
      out.push(baseBundle({
        id: 'figures/' + subject + '/' + review.suffix,
        stage: review.stage,
        title: subject + ' · ' + review.label + '提示词',
        builder: 'figure-generation.reviewFigure',
        source: { builder: 'figure-generation.reviewFigure', options: { pixels: review.suffix === 'review-pixels' } },
        subject,
        createdAt,
        systemSource: 'builder+structured',
        rawSystem: rawReview.system,
        system: actualReview.system,
        systemSuffix: actualReview.systemSuffix,
        input: actualReview.input,
        schema: actualReview.schema,
        generation: actualReview.generation,
        outputReminder: actualReview.outputReminder,
        image: actualReview.image.attached ? {
          attached: true,
          mimeType: actualReview.image.mimeType,
          dataChars: actualReview.image.dataChars,
          note: '实际请求另附图片；导出不含 base64 图片字节。'
        } : null,
        notes: [
          '输入题目与图示委托含'+FIXTURE_MARK+'占位，不是真实试题。',
          review.suffix === 'review-pixels'
            ? '像素核对的实际请求另附图片；本导出只记录图片元数据，不导出 base64。'
            : review.suffix === 'review-brief'
              ? '无像素委托核对只核对委托描述，不能声称已核验实际图片。'
              : '矢量核对审查矢量定义，不声称已核验实际图片像素。',
          'structured 在 system 末尾追加输出 Schema 说明；实际 system 见上方原文。'
        ]
      }));
    }
  }
  return out;
}

function illustrationBundle(createdAt) {
  const subject = '生物';
  const diagram = {
    kind: 'illustration',
    caption: FIXTURE_MARK + '叶片横切结构示意（教师演示占位）',
    description: FIXTURE_MARK + '叶片横切：仅呈现题干已给的表皮、叶肉和叶脉位置关系，不显示未给出的细胞器和定量数据。'
  };
  const layout = { width: 'standard', aspect: 'wide' };
  const promptText = illustrationPrompt(diagram, { layout });
  return baseBundle({
    id: 'illustration/representative',
    stage: 'illustration',
    title: '生物 · 代表性生图提示词',
    builder: 'figure-prompt-guidance.illustrationPrompt',
    source: { builder: 'figure-prompt-guidance.illustrationPrompt', options: { layout } },
    subject,
    createdAt,
    systemSource: 'illustrationPrompt',
    rawSystem: null,
    system: null,
    input: { diagram, layout },
    schema: null,
    outputReminder: '',
    promptText,
    notes: [
      '这是一份代表性生图提示词，不包含任何图片字节或 base64。',
      '实际请求按生图服务协议发送：chat-image 使用 messages 的 user content；native-image 使用 prompt 及 size/quality/output_format。',
      '提示词中的叶片横切规则由当前 illustrationPrompt 按 description 自动追加。'
    ]
  });
}

async function collectPromptBundles({ now = Date.now() } = {}) {
  const createdAt = new Date(now).toISOString();
  const bundles = [...await exerciseBundles(createdAt)];
  for (const subject of SUBJECT_ORDER) bundles.push(await reviewBundle(subject, createdAt));
  for (const subject of SUBJECT_ORDER) bundles.push(await repairBundle(subject, createdAt));
  bundles.push(...await figureBundles(createdAt));
  bundles.push(illustrationBundle(createdAt));
  return bundles;
}

function bundlePaths(bundle) {
  if (bundle.stage === 'exercise') return { txt: bundle.id + '/prompt.txt', json: bundle.id + '/prompt.json' };
  if (bundle.stage === 'review') return { txt: bundle.id + '/review.txt', json: bundle.id + '/review.json' };
  if (bundle.stage === 'repair') return { txt: bundle.id + '/repair.txt', json: bundle.id + '/repair.json' };
  if (bundle.stage === 'illustration') return { txt: 'illustration/representative-illustration.txt', json: 'illustration/representative-illustration.json' };
  const parts = bundle.id.split('/');
  return { txt: bundle.id + '/' + parts[2] + '.txt', json: bundle.id + '/' + parts[2] + '.json' };
}

function bundleText(bundle) {
  const header = [
    '# ' + bundle.title,
    'export-format: ' + FORMAT,
    'id: ' + bundle.id,
    'stage: ' + bundle.stage,
    'builder: ' + bundle.builder,
    'subject: ' + bundle.subject,
    ...(bundle.template ? ['template: ' + bundle.template] : []),
    ...(bundle.visuals ? ['visuals: ' + bundle.visuals] : []),
    'system-source: ' + bundle.systemSource,
    'static-compile: true',
    'model-call: false',
    'fixture-marker: ' + FIXTURE_MARK,
    'provenance: 匿名教师演示配置；不来自原表、真实学生或真实考试。',
    ''
  ];
  const sections = bundle.stage === 'illustration' ? [
    '===== ILLUSTRATION PROMPT 原文（未润色） =====',
    bundle.promptText,
    '',
    '===== USER INPUT 示例（JSON，未润色） =====',
    JSON.stringify(bundle.input, null, 2),
    '',
    '===== 说明 =====',
    '生图接口不使用 system 或输出 Schema；实际请求按生图服务协议发送。'
  ] : [
    '===== SYSTEM 原文（未润色；已反映实际适配代码追加内容） =====',
    bundle.system,
    '',
    ...(bundle.systemSuffix ? [
      '===== SYSTEM 追加段（structured 实际追加，已包含在上方 system 中） =====',
      bundle.systemSuffix,
      ''
    ] : []),
    '===== USER INPUT 示例（JSON，未润色） =====',
    JSON.stringify(bundle.input, null, 2),
    '',
    '===== OUTPUT SCHEMA（JSON） =====',
    JSON.stringify(bundle.schema, null, 2),
    '',
    ...(bundle.generation ? [
      '===== GEMINI generationConfig（Schema 之外的实际参数） =====',
      JSON.stringify(bundle.generation, null, 2),
      ''
    ] : [])
  ];
  const footer = [
    '===== GEMINI 尾部 outputReminder（适配代码追加，非 system） =====',
    bundle.outputReminder || '(无)',
    '',
    ...(bundle.image ? [
      '===== 图片（仅元数据） =====',
      JSON.stringify(bundle.image, null, 2),
      ''
    ] : []),
    '===== 备注 =====',
    ...bundle.notes.map(note => '- ' + note),
    '- 供应商差异与原始尾部说明见 providers/PROVIDER-BEHAVIOR.md、providers/output-reminders.json。',
    '- 完整机器可读原文见同目录 JSON；本 TXT 不是摘要。'
  ];
  return [...header, ...sections, '', ...footer].join('\n') + '\n';
}

function bundleJson(bundle) {
  return JSON.stringify({
    format: bundle.format,
    id: bundle.id,
    stage: bundle.stage,
    title: bundle.title,
    builder: bundle.builder,
    source: bundle.source,
    subject: bundle.subject,
    template: bundle.template,
    visuals: bundle.visuals,
    createdAt: bundle.createdAt,
    provenance: bundle.provenance,
    systemSource: bundle.systemSource,
    rawSystem: bundle.rawSystem,
    system: bundle.system,
    systemSuffix: bundle.systemSuffix,
    input: bundle.input,
    schema: bundle.schema,
    generation: bundle.generation,
    outputReminder: bundle.outputReminder,
    promptText: bundle.promptText,
    image: bundle.image,
    kimi: bundle.kimi,
    notes: bundle.notes,
    providerNotes: 'providers/PROVIDER-BEHAVIOR.md'
  }, null, 2) + '\n';
}

function providerBehaviorMarkdown(bundles) {
  const sample = bundles.find(bundle => bundle.id === 'exercise/数学/targeted-auto');
  return [
    '# 供应商适配行为与尾部原文说明',
    '',
    '本文件说明本次导出所依据的实际适配代码路径。所有结论均来自当前仓库代码；没有访问网络、凭据或真实模型。',
    '若适配器后续变更，请重新运行导出；尾注与 payload 原文以 `output-reminders.json`、payload 样例和当前代码为准。',
    '',
    '## 1. Gemini 官方冻结通道',
    '',
    '- 出题与修复：`generator.generate` 在 `generation.protocol==="gemini"` 时调用 `model-completion.completeGemini`。',
    '- 复核与图示：`content-check.reviewContent`、`figure-generation.planFigure`、`figure-generation.reviewFigure` 默认调用 `figure-generation.structured`，再进入 `completeGemini`。',
    '- `completeGemini` 在 `contents.at(-1).parts` 末尾追加 `prompt-policy.outputReminder(prompt)`。该尾注是 user part，不并入 system。',
    '- 尾注内容取决于输出 Schema、环节和学科：数学会追加几何翻折命名提醒，政治会追加普通 Unicode 箭头提醒；本次 exercise 样例是数学，因此含几何翻折句。',
    '- 出题/修复的 system 原文直接来自 builder；复核/图示的 system 还会被 `structured` 在末尾追加一段「输出JSON Schema…」说明。导出中的 `system` 是实际发送文本，`rawSystem` 是 builder 原文，`systemSuffix` 是 structured 追加段。',
    '- `generationConfig.responseJsonSchema` 保存本次输出 Schema。',
    '- 旧版 `generator.generate` 的默认直连分支直接发送 `prompt.body`，不会经过 `completeGemini`，因此不会追加 outputReminder；本导出以官方冻结通道为准，并保留此差异说明。',
    '',
    '## 2. Kimi',
    '',
    '- `kimi.completeKimi` 发送 `messages:[system, user JSON]`，system 与 user JSON 不润色。',
    '- Schema 放在 `response_format.json_schema.schema`，并先经过 `kimiExerciseSchema`：为 `questions.items` 与 `questions.prefixItems[*]` 的每个 `anyOf` 分支补 `type:"object"`，再把基础字段约束合并进分支。',
    '- Kimi 不追加 Gemini 的 outputReminder。',
    '- 原始 Schema 与 Kimi 适配 Schema 的完整对照见 `providers/kimi-schema.json`，实际请求体见 `providers/kimi-exercise-payload.json`。',
    '',
    '## 3. 官方 chat-completions / responses / anthropic 通道',
    '',
    '- `model-completion.completeRemote` 组装 `messages:[{role:"system",content:prompt.system},{role:"user",content:JSON.stringify(prompt.input)}]`，再用纯函数 `model-adapter.adaptModelBody` 生成供应商 payload。',
    '- `adaptModelBody` 只增加传输层字段（模型、token 上限、reasoning/thinking 等），不改写 system 或 user JSON。',
    '- 这些通道不使用 Gemini 的 outputReminder；也不把 Schema 作为独立 response_format 字段发送。出题/修复的 Schema 说明在 system 文本内；复核/图示的更完整 Schema 说明由 `structured` 追加在 system 末尾。',
    '- OpenAI ChatGPT 授权的实际请求由 `openai-siwc.complete` 负责凭据刷新与发送，但它同样用 `adaptModelBody` 生成 responses 形状；本样例展示该形状，不含凭据。',
    '- 样例 payload 见 `providers/official-responses-payload.json`、`providers/official-chat-payload.json`、`providers/official-anthropic-payload.json`、`providers/openai-chatgpt-payload.json`。',
    '',
    '## 4. 生图',
    '',
    '- `illustration.generateIllustration` 直接把 `illustrationPrompt` 作为提示词；chat-image 协议放在 user content，native-image 协议放在 `prompt` 字段，并按版位附加 size/quality/output_format。',
    '- 本导出只导出一份代表性提示词，不导出任何图片字节或 base64。',
    '',
    '## 5. 像素核对',
    '',
    '- 本次像素核对按 Gemini 适配路径导出；实际请求会在 user parts 中附加 `inlineData` 图片。导出只记录 `image.attached`、`mimeType`、`dataChars`，不导出 base64。其他协议由 `model-vision.attachImage` 按各自字段附图片，导出同样不含字节。',
    '',
    '## 6. 代表性对象',
    '',
    '- 本说明的 payload 样例使用 `' + sample.id + '` 的出题提示词；其 system/input 与对应 `prompt.json` 完全一致。'
  ].join('\n') + '\n';
}

function branchChangeSummary(original, adapted) {
  const collect = schema => {
    const questions = schema?.properties?.questions;
    if (!questions) return [];
    const items = [];
    if (questions.items) items.push({ path: 'questions.items', item: questions.items });
    for (const [index, item] of (questions.prefixItems || []).entries()) items.push({ path: 'questions.prefixItems[' + index + ']', item });
    return items.flatMap(({ path: itemPath, item }) => (item.anyOf || []).map((branch, branchIndex) => ({
      path: itemPath + '.anyOf[' + branchIndex + ']',
      type: branch.type ?? null
    })));
  };
  const before = collect(original);
  const after = collect(adapted);
  return before.map((row, index) => ({
    path: row.path,
    typeBefore: row.type,
    typeAfter: after[index]?.type ?? null
  }));
}

async function buildProviderArtifacts(bundles) {
  const sample = bundles.find(bundle => bundle.id === 'exercise/数学/targeted-auto');
  const prompt = await generator.buildExercisePrompt(sample.input, { separateFigures: true });
  const gemini = await captureGeminiBody(prompt);

  const officialBase = {
    messages: [
      { role: 'system', content: sample.system },
      { role: 'user', content: JSON.stringify(sample.input) }
    ],
    max_tokens: 32768,
    effort: 'deep'
  };
  const official = [
    { path: 'providers/official-responses-payload.json', provider: 'bytecat-gpt', model: 'gpt-6.1-sol' },
    { path: 'providers/official-chat-payload.json', provider: 'command-code', model: 'gpt-6-astra' },
    { path: 'providers/official-anthropic-payload.json', provider: 'bytecat', model: 'claude-opus-5-5' },
    { path: 'providers/openai-chatgpt-payload.json', provider: 'openai-chatgpt', model: 'gpt-6.1-sol' }
  ].map(item => ({
    path: item.path,
    text: JSON.stringify({
      format: FORMAT,
      note: '由 model-adapter.adaptModelBody 纯函数生成；不含鉴权头；system 与 user JSON 未润色；Schema 未作为独立 response_format 发送。' + (item.provider === 'openai-chatgpt' ? ' OpenAI ChatGPT 授权的实际发送由 openai-siwc.complete 负责，但同样经 adaptModelBody 生成该 responses 形状。' : ''),
      builder: 'model-adapter.adaptModelBody',
      provider: item.provider,
      model: item.model,
      protocol: providers[item.provider]?.protocol || null,
      payload: adapter.adaptModelBody(clone(officialBase), { name: item.provider, model: item.model }, 'deep')
    }, null, 2) + '\n',
    meta: { kind: 'provider', stage: 'provider', provider: item.provider, model: item.model }
  }));

  let kimiBody = null;
  const kimiStop = sentinel();
  try {
    await kimi.completeKimi({ input: sample.input, system: sample.system, schema: sample.schema }, {
      key: CAPTURE_KEY,
      kind: 'platform',
      model: 'kimi-k3',
      effort: 'max',
      transport: async (_url, options) => {
        kimiBody = JSON.parse(options.body);
        throw kimiStop;
      }
    });
  } catch (error) {
    if (error !== kimiStop) throw error;
  }
  if (!kimiBody) throw new Error('STATIC_EXPORT_CAPTURE_FAILED');

  const adaptedSchema = kimi.kimiExerciseSchema(sample.schema);
  const outputReminders = {
    format: FORMAT,
    note: '以下为 Gemini 官方冻结通道 actual outputReminder 原文；它是 completeGemini 追加的最后一段 user part，不是 system。Kimi 不追加该尾注。',
    subjectNote: 'outputReminder 还会按学科追加数学几何翻折或政治普通箭头提醒；exercise 样例为数学，故含几何翻折句。',
    model: GEMINI.model,
    adapter: 'model-completion.completeGemini',
    reminders: {
      exercise: { id: 'exercise/数学/targeted-auto', text: sample.outputReminder },
      repair: { id: 'repair/语文', text: bundles.find(bundle => bundle.id === 'repair/语文').outputReminder },
      review: { id: 'review/语文', text: bundles.find(bundle => bundle.id === 'review/语文').outputReminder },
      figurePlan: { id: 'figures/数学/plan', text: bundles.find(bundle => bundle.id === 'figures/数学/plan').outputReminder },
      figureReview: { id: 'figures/数学/review-vector', text: bundles.find(bundle => bundle.id === 'figures/数学/review-vector').outputReminder }
    },
    legacyDirectNote: 'generator.cjs 的旧版默认直连分支不经过 completeGemini，因此不追加 outputReminder。',
    kimiNote: 'kimi.completeKimi 不追加 outputReminder；Schema 通过 response_format.json_schema 发送，并经过 kimiExerciseSchema 适配。'
  };

  return [
    { path: 'providers/PROVIDER-BEHAVIOR.md', text: providerBehaviorMarkdown(bundles), meta: { kind: 'provider', stage: 'provider' } },
    {
      path: 'providers/gemini-exercise-payload.json',
      text: JSON.stringify({
        format: FORMAT,
        note: '实际 Gemini 冻结通道请求体的静态捕获；不含鉴权头；system/input 未润色；outputReminder 为最后一段 user part。',
        builder: 'model-completion.completeGemini',
        model: GEMINI.model,
        payload: gemini.body
      }, null, 2) + '\n',
      meta: { kind: 'provider', stage: 'provider', provider: 'gemini', model: GEMINI.model }
    },
    ...official,
    {
      path: 'providers/kimi-exercise-payload.json',
      text: JSON.stringify({
        format: FORMAT,
        note: '由 kimi.completeKimi 实际组装并经 transport 静态捕获；不含鉴权头；system/input 未润色；Schema 已由 kimiExerciseSchema 适配。',
        builder: 'kimi.completeKimi',
        provider: 'kimi-platform',
        model: 'kimi-k3',
        payload: kimiBody
      }, null, 2) + '\n',
      meta: { kind: 'provider', stage: 'provider', provider: 'kimi-platform', model: 'kimi-k3' }
    },
    {
      path: 'providers/output-reminders.json',
      text: JSON.stringify(outputReminders, null, 2) + '\n',
      meta: { kind: 'provider', stage: 'provider' }
    },
    {
      path: 'providers/kimi-schema.json',
      text: JSON.stringify({
        format: FORMAT,
        note: 'kimiExerciseSchema 的完整前后对照；它只补分支 type 并合并基础字段约束，不润色题目文本。',
        builder: 'kimi.kimiExerciseSchema',
        sourceId: 'exercise/数学/targeted-auto',
        original: sample.schema,
        adapted: adaptedSchema,
        branchChanges: branchChangeSummary(sample.schema, adaptedSchema),
        changeScope: 'branchChanges 只列出 anyOf 分支新增的 type；字段约束合并的完整结果见 adapted。'
      }, null, 2) + '\n',
      meta: { kind: 'provider', stage: 'provider' }
    }
  ];
}

function link(target, label) {
  return '[' + label + '](' + target + ')';
}

function readmeIndex(bundles, providerArtifacts, counts, generatedAt) {
  const byId = new Map(bundles.map(bundle => [bundle.id, bundle]));
  const paths = new Map(bundles.map(bundle => [bundle.id, bundlePaths(bundle)]));
  const cell = id => {
    if (!byId.has(id)) return '—';
    const target = paths.get(id);
    return link(target.txt, 'TXT') + ' / ' + link(target.json, 'JSON');
  };
  const lines = [
    '<!-- GENERATED-EXPORT-INDEX -->',
    '',
    '## 本次导出目录索引',
    '',
    '生成时间：' + generatedAt + '。静态编译；未调用模型，未访问网络。',
    '',
    '覆盖数量：出题 ' + counts.exercise + '；内容复核 ' + counts.review + '；格式修复 ' + counts.repair + '；图示 ' + counts.figure + '（规划/矢量核对/像素核对/无像素委托核对各 ' + counts.figurePerStage + '）；代表性生图 ' + counts.illustration + '。',
    '',
    '### 覆盖矩阵',
    '',
    '| 学科 | 出题组合 | 复核 | 修复 | 图示规划 | 矢量核对 | 像素核对 | 委托核对 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'
  ];
  for (const subject of SUBJECT_ORDER) {
    lines.push('| ' + subject + ' | ' + counts.exercisePerSubject + ' | ' + cell('review/' + subject) + ' | ' + cell('repair/' + subject) + ' | ' + cell('figures/' + subject + '/plan') + ' | ' + cell('figures/' + subject + '/review-vector') + ' | ' + cell('figures/' + subject + '/review-pixels') + ' | ' + cell('figures/' + subject + '/review-brief') + ' |');
  }
  lines.push('', '注：出题组合为 3 种训练策略 × 4 种配图策略；内容复核与格式修复逐科导出；图示规划、矢量核对、像素核对、无像素委托核对逐科导出。', '');
  lines.push('### 出题提示词（10 学科 × 3 策略 × 4 配图策略）', '');
  for (const subject of SUBJECT_ORDER) {
    lines.push('#### ' + subject, '', '| 策略 | auto | none | vector | hybrid |', '| --- | --- | --- | --- | --- |');
    for (const template of STRATEGIES) {
      lines.push('| ' + template + ' | ' + VISUALS.map(visuals => cell('exercise/' + subject + '/' + template + '-' + visuals)).join(' | ') + ' |');
    }
    lines.push('');
  }
  lines.push('### 内容复核与格式修复', '', '| 学科 | 复核 | 修复 |', '| --- | --- | --- |');
  for (const subject of SUBJECT_ORDER) {
    lines.push('| ' + subject + ' | ' + cell('review/' + subject) + ' | ' + cell('repair/' + subject) + ' |');
  }
  lines.push('', '### 图示与生图', '', '| 学科 | 规划 | 矢量核对 | 像素核对 | 无像素委托核对 |', '| --- | --- | --- | --- | --- |');
  for (const subject of SUBJECT_ORDER) {
    lines.push('| ' + subject + ' | ' + cell('figures/' + subject + '/plan') + ' | ' + cell('figures/' + subject + '/review-vector') + ' | ' + cell('figures/' + subject + '/review-pixels') + ' | ' + cell('figures/' + subject + '/review-brief') + ' |');
  }
  lines.push('', '- 代表性生图提示词：' + cell('illustration/representative'));
  lines.push('', '### 供应商行为与清单', '');
  lines.push('- 供应商适配行为：' + link('providers/PROVIDER-BEHAVIOR.md', 'PROVIDER-BEHAVIOR.md'));
  lines.push('- Gemini 尾注原文：' + link('providers/output-reminders.json', 'output-reminders.json'));
  lines.push('- Kimi Schema 前后对照：' + link('providers/kimi-schema.json', 'kimi-schema.json'));
  lines.push('- Gemini 请求体样例：' + link('providers/gemini-exercise-payload.json', 'gemini-exercise-payload.json'));
  lines.push('- 官方 responses：' + link('providers/official-responses-payload.json', 'official-responses-payload.json'));
  lines.push('- 官方 chat-completions：' + link('providers/official-chat-payload.json', 'official-chat-payload.json'));
  lines.push('- 官方 anthropic：' + link('providers/official-anthropic-payload.json', 'official-anthropic-payload.json'));
  lines.push('- OpenAI ChatGPT 授权：' + link('providers/openai-chatgpt-payload.json', 'openai-chatgpt-payload.json'));
  lines.push('- Kimi 请求体样例：' + link('providers/kimi-exercise-payload.json', 'kimi-exercise-payload.json'));
  lines.push('- 清单：' + link('manifest.json', 'manifest.json') + '；校验：' + link('SHA256SUMS.txt', 'SHA256SUMS.txt'));
  lines.push('', 'ZIP 可由调用方在导出完成后自行打包；本工具不引入压缩依赖。');
  return lines.join('\n') + '\n';
}

async function readGuide() {
  const guidePath = path.join(__dirname, '..', 'docs', 'PROMPT-EXPORT-2026-10-21.md');
  try {
    const text = await fs.readFile(guidePath, 'utf8');
    const marker = text.indexOf('<!-- GENERATED-EXPORT-INDEX -->');
    return (marker >= 0 ? text.slice(0, marker) : text).trimEnd() + '\n';
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [
      '# 训练提示词导出',
      '',
      '这是教师审阅导览。完整编译原文在同目录 TXT/JSON。',
      ''
    ].join('\n');
  }
}

async function buildReadme(bundles, providerArtifacts, counts, generatedAt) {
  const guide = await readGuide();
  return guide + '\n' + readmeIndex(bundles, providerArtifacts, counts, generatedAt);
}

async function writeNewFile(outDir, relative, text) {
  const target = path.join(outDir, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, text, { encoding: 'utf8', flag: 'wx' });
  return target;
}

async function ensureNewDirectory(outDir) {
  if (!outDir || !path.isAbsolute(outDir)) {
    throw Object.assign(new Error('输出目录必须是绝对路径。'), { code: 'EXPORT_OUT_ABSOLUTE_REQUIRED' });
  }
  let exists = false;
  try {
    await fs.stat(outDir);
    exists = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (exists) throw Object.assign(new Error('输出目录已存在，拒绝覆盖已有导出。'), { code: 'EXPORT_DIR_EXISTS' });
  try {
    await fs.mkdir(outDir);
  } catch (error) {
    if (error.code === 'ENOENT') throw Object.assign(new Error('输出目录的父目录不存在，请先创建父目录。'), { code: 'EXPORT_PARENT_MISSING' });
    throw error;
  }
}

function countBundles(bundles) {
  const exercise = bundles.filter(bundle => bundle.stage === 'exercise');
  return {
    total: bundles.length,
    exercise: exercise.length,
    exercisePerSubject: exercise.length / SUBJECT_ORDER.length,
    review: bundles.filter(bundle => bundle.stage === 'review').length,
    reviewPerSubject: 1,
    repair: bundles.filter(bundle => bundle.stage === 'repair').length,
    repairPerSubject: 1,
    figurePerSubject: 4,
    figure: bundles.filter(bundle => bundle.stage.startsWith('figure-')).length,
    figurePerStage: bundles.filter(bundle => bundle.stage.startsWith('figure-')).length / 4,
    illustration: bundles.filter(bundle => bundle.stage === 'illustration').length
  };
}

async function exportTrainingPrompts({ outDir, now = Date.now() } = {}) {
  await ensureNewDirectory(outDir);
  const generatedAt = new Date(now).toISOString();
  const bundles = await collectPromptBundles({ now });
  const providerArtifacts = await buildProviderArtifacts(bundles);
  const counts = countBundles(bundles);
  const readme = await buildReadme(bundles, providerArtifacts, counts, generatedAt);

  const writes = [{ path: 'README.md', text: readme, meta: { kind: 'guide', stage: 'guide' } }];
  for (const bundle of bundles) {
    const targets = bundlePaths(bundle);
    writes.push({ path: targets.txt, text: bundleText(bundle), meta: { kind: 'prompt', stage: bundle.stage, subject: bundle.subject, template: bundle.template, visuals: bundle.visuals, id: bundle.id } });
    writes.push({ path: targets.json, text: bundleJson(bundle), meta: { kind: 'prompt', stage: bundle.stage, subject: bundle.subject, template: bundle.template, visuals: bundle.visuals, id: bundle.id } });
  }
  writes.push(...providerArtifacts);

  const files = [];
  for (const item of writes) {
    await writeNewFile(outDir, item.path, item.text);
    files.push({
      path: item.path,
      bytes: Buffer.byteLength(item.text, 'utf8'),
      sha256: sha256(item.text),
      ...item.meta
    });
  }
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);

  const contract = await import('../backend/exercise-contract.mjs');
  const repoRoot=path.resolve(__dirname,'..'),sourcePaths=['backend/generator.cjs','backend/templates.cjs','backend/teacher-brief.cjs','backend/content-check.cjs','backend/prompt-policy.cjs','backend/subject-scoring.cjs','backend/document-format.cjs','backend/curriculum-boundaries.cjs','backend/exercise-contract.mjs','backend/exercise-group-scope.cjs','backend/figure-generation.cjs','backend/figure-prompt-guidance.cjs','backend/figure-guidance.cjs','backend/advanced-figure-guidance.cjs','backend/geography-guidance.cjs','backend/model-adapter.cjs','backend/model-completion.cjs','backend/model-profiles.json','backend/kimi.cjs',TOOL];
  const sourceFiles=await Promise.all(sourcePaths.map(async file=>({file,sha256:sha256(await fs.readFile(path.join(repoRoot,file)))})));
  let sourceCommit=null,sourceWorkingTreeDirty=null;
  try{sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();sourceWorkingTreeDirty=!!execFileSync('git',['status','--porcelain','--',...sourcePaths],{cwd:repoRoot,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
  const manifest = {
    format: FORMAT,
    tool: TOOL,
    generatedAt,
    staticCompile: true,
    modelCalls: false,
    networkAccess: false,
    credentialsIncluded: false,
    source:{commit:sourceCommit,workingTreeDirty:sourceWorkingTreeDirty,files:sourceFiles},
    counts,
    versions: {
      templates: templates.version,
      promptPolicy: promptPolicy.version,
      modelProfiles: adapter.profileVersion,
      exerciseContract: contract.EXERCISE_VERSION
    },
    subjects: SUBJECT_ORDER,
    strategies: STRATEGIES,
    visuals: VISUALS,
    provenance: clone(PROVENANCE),
    notes: [
      '所有提示词由当前仓库 builder 静态编译；没有模型请求，没有鉴权字段。',
      '样例为匿名教师演示配置；' + FIXTURE_MARK + '题不是真实试题，不来自原表、学生或考试。',
      '出题提示词使用 separateFigures=true：出题阶段只产生 figureRequest，图示由独立环节生成和核对。',
      'figures/*/review-pixels 的实际请求另附图片；导出只含元数据，不含 base64。',
      'ZIP 打包由调用方后处理，本工具不引入压缩依赖。'
    ],
    files
  };
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  await writeNewFile(outDir, 'manifest.json', manifestText);
  const manifestHash = sha256(manifestText);
  const sums = [
    ...files.map(file => file.sha256 + '  ' + file.path),
    manifestHash + '  manifest.json'
  ].join('\n') + '\n';
  await writeNewFile(outDir, 'SHA256SUMS.txt', sums);

  return { outDir, generatedAt, counts, bundles, files, manifest, manifestHash };
}

function usage() {
  return [
    '用法：node tools/export-training-prompts.cjs --out ABS_DIR',
    '',
    '  --out ABS_DIR  新建的绝对路径目录；已存在时拒绝覆盖。',
    '  --help         显示本说明。',
    '',
    '静态编译当前仓库的真实提示词 builder；不调用模型，不访问网络，不读取凭据。'
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  let outDir = null;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage() + '\n');
      return 0;
    }
    if (arg === '--out') {
      outDir = argv[++index];
      if (!outDir) throw new Error('--out 缺少目录参数。');
      continue;
    }
    if (arg.startsWith('--out=')) {
      outDir = arg.slice('--out='.length);
      continue;
    }
    throw new Error('未知参数：' + arg + '\n' + usage());
  }
  if (!outDir) throw new Error('缺少 --out ABS_DIR。\n' + usage());
  const result = await exportTrainingPrompts({ outDir });
  process.stdout.write([
    '已导出到 ' + result.outDir,
    '提示词对象：' + result.counts.total + '（出题 ' + result.counts.exercise + '，复核 ' + result.counts.review + '，修复 ' + result.counts.repair + '，图示 ' + result.counts.figure + '，生图 ' + result.counts.illustration + '）',
    '清单：' + path.join(result.outDir, 'manifest.json'),
    '校验：' + path.join(result.outDir, 'SHA256SUMS.txt')
  ].join('\n') + '\n');
  return 0;
}

if (require.main === module) {
  main().then(code => {
    if (code) process.exitCode = code;
  }).catch(error => {
    process.stderr.write((error && error.message ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  FORMAT,
  FIXTURE_MARK,
  SUBJECT_ORDER,
  STRATEGIES,
  VISUALS,
  DEMOS,
  demoInput,
  demoSheet,
  vectorDiagram,
  illustrationDiagram,
  collectPromptBundles,
  bundlePaths,
  bundleText,
  bundleJson,
  exportTrainingPrompts,
  ensureNewDirectory,
  sha256,
  main
};
