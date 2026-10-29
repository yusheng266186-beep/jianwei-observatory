目录唯一源为 `textbook-directory.json`。版本、来源与维护方式见 [出题设计说明](../../docs/EXERCISE-DESIGN-2026-10-29.md)。

运行 `node tools/build-textbook-catalog.cjs` 生成运行时目录，`--check` 检查一致性。各册 source 内 sourcePages 为 PDF 从1开始的页码；mirror 为实际读取的出版社原书镜像，officialPdf 为已定位的官方资源地址（部分有访问限制）。

数学按知识体系浏览的目录源为 `math-knowledge.json`，运行 `node tools/build-math-knowledge.cjs` 生成运行时数据。四级分类、课程范围和维护方式见 [数学知识体系说明](../../docs/MATH-KNOWLEDGE-2026-10-29.md)。
