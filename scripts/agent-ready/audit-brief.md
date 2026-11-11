# Audit brief (one agent per packet, read-only)

Read-only audit of one generated Markdown packet; edit nothing. Packet: <ROOT>/<preset>/<slug> (PRD.md ARD.md TRD.md TASKS.md AGENTS.md blueprint.json kit/). Preset: <preset>. The user's idea: "<idea>". A coding agent will build the app from ONLY these files (docs + kit), following TASKS.md in order. Read all five .md files fully, then the kit README and the kit source files the tasks reference. Echo the packet slug in the 'slug' field of your answer.

Decide whether a coding agent could build exactly this product with no guesswork and no contradictions. Report only CONCRETE defects (where = file + heading/task id; quote = exact text; why = what an agent would have to guess or what would fail; fix = one-line change to the compiler output). BLOCKING = an agent would stall, build the wrong thing, a required UI/function has no owner, a command would fail, or two documents contradict each other on something that changes the code. POLISH = cosmetic or a testability nicety. Do not report as blocking anything that is merely a provider's wording choice in the PRD that a coder can follow without guessing, or anything a competent coder resolves from the stated conventions.

Check specifically:
1. every idea sentence maps to a feature + acceptance criterion; nothing promised that the idea did not ask for, nothing asked that is missing.
2. task order: no task uses a screen/state/store/function created by a later task; every control a later task's acceptance criteria mention has a named owner and a place to be built; no slot is built that no task uses.
3. the data contract names stored fields, wire/DB types, operations per object, ids, ordering, and an interface; every task uses only that interface; time/date rules are unambiguous.
4. schedules/endpoints/web pages consistent in PRD/TRD/TASKS/kit.
5. AGENTS Owner Map and shared-file lines agree with TASKS create/modify lists; no file created twice; every modify target exists earlier (kit copy counts); test/build commands that run in each task can pass at that point in the order.
6. names consistent across docs and kit.
7. boilerplate that does not apply.
8. acceptance criteria mechanically testable; time-based ones use an injected clock; validation commands runnable in a normal dev environment.
9. kit files named in TASKS exist and match what tasks expect.
10. preset-specific build/run path coherent.
11. delayed writes: when a write waits (an autosave delay, a debounce, a timer, a queued save), the packet states what happens to a pending write when the app or window closes or the screen is left (written at once, or lost by design), names the owner and the mechanism, and has an acceptance criterion for it.

If you find nothing blocking, say so plainly. Do not pad: no style nits.
Output JSON: { slug, blocking: [{where, quote, why, fix}], polish: [...], verdict }.
