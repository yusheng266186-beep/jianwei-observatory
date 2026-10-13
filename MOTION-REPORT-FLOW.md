# Motion and live report composition — flow-v29

The public Pages address is unchanged. Internal asset versions change together so
one refresh loads a consistent application. Student records remain browser-local.

## Motion and interaction

- Whole-page Dock travel uses a monotonic nonlinear glide with continuous
  outgoing/incoming panes, avoiding a costly overlap of two translucent pages. The indicator shares the same settling curve.
  Both outgoing and incoming content move; the header and Dock stay fixed.
- Reversing direction uses the actual current position and opacity of the exiting
  page. Previous planes and animations are disposed, including paused effects.
  Fixed comparison controls retain their screen position. Reduce-motion / static
  reading preferences still skip page travel.
- Scene replacement skips unnecessary FLIP/plot geometry sampling. ID remapping
  visits reference-bearing elements instead of every attribute in dense tables.
  Outgoing observers are removed. FLIP reads are batched before animation writes.
- During page travel, the two composited planes retain the glass gradients without
  recomputing a live backdrop blur for every card. Full backdrop material returns
  when the transition completes or is cancelled. No permanent material changes.
- Focus / pointer intent warms scene modules without processing grades in the
  background. Cold imports, errors and last-action-wins navigation retain their
  previous semantics.
- The student drawer preserves focus when its title's temporary tabindex is
  reconciled away. Previously subsequent direction keys went to the document body
  and were ignored. Disabled end-of-list keys no longer scroll the background.
  Drawer content changes use a smaller, softly decelerating transition. Report
  disclosures share the bounded open/close animation; editing opens the relevant
  settings and cancels an obsolete collapse.

## Reports

- Chapter inclusion and editing now have separate controls. Editing fields does
  not silently remove a chapter. Counters reflect selected records, not just the
  number of rows in the full original material.
- The details-view search now filters the exported records too. It is mirrored
  with the chapter's output filter. Preview, PDF, Word, Excel and print share one
  selected-report projection.
- Downloads commit visible title/filter/judgment values immediately, even before
  the debounced preview or IME completion. Each asynchronous export uses a deep
  snapshot of the choices at click time. A later edit affects the next download.
  Busy buttons survive preview redraws and release on export failure for retry.
- Exam, class, subject, target-band and student choices can be changed directly
  in the report dialog. New data is calculated, not relabelled. Same-title chapter
  choices, order, filters and same-name fields transfer to the new report; indices
  from the old report never select unrelated fields. New sections use their
  normal default inclusion. A saved source report remains intact.
- Student search supports an exact class expression such as `7班`, so it does not
  include `17班`. Foreign-language comparison remains unified; English/Japanese
  question evidence remains separate.
- Save-current-combination is next to download controls, available independently
  of the optional teacher-judgment disclosure. Saved combinations restore.
- Printing remains A4 monochrome. On-screen paper preview is a continuous reading
  view; PDF and Word add their own pagination.

## Validation

Anonymous fixture data only. Unit tests exercise semantic selection transfer.
`test:report-live-output` downloads two distinct sets of real PDFs and DOCX files,
extracts PDF text and Word XML, and asserts names, omitted chapters and fields.
It also exercises scope changes, saved combinations and mobile reading. Existing
composer, reading, report-error and slide/motion suites cover the associated
paths. Performance measurements use headless Chromium in this container and do
not promise frame rates on a user's device.
