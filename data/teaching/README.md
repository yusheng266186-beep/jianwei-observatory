目录唯一源为 `textbook-directory.json`。版本、来源与维护方式见 [出题设计说明](../../docs/EXERCISE-DESIGN-2026-10-29.md)。

运行 `node tools/build-textbook-catalog.cjs` 生成运行时目录，`--check` 检查一致性。各册 source 内 sourcePages 为 PDF 从1开始的页码；mirror 为实际读取的出版社原书镜像，officialPdf 为已定位的官方资源地址（部分有访问限制）。
