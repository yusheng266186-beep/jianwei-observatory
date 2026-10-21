# Local MathJax 3.2.2

`tex-svg.js` and the TeX extensions are from the official `mathjax@3.2.2` npm release (`https://registry.npmjs.org/mathjax/-/mathjax-3.2.2.tgz`). The archive integrity was checked against the registry SHA-512 before extraction; the release LICENSE is retained.

The 26 local mathematical/chemical extensions are loaded on demand for worksheet preview, PDF and Word. They do not add homepage requests. `boldsymbol` is required by actual generated vector formulas; other common layout extensions prevent equivalent offline export failures. HTML, arbitrary package loading, dynamic configuration and UI action extensions are not added. App-level formula command restrictions remain in force.
