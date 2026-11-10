# Usage: python3 scripts/agent-ready/make-audit-prompts.py /tmp/v4-roundN <out-folder>   (the out folder must exist)
# Writes one audit prompt per packet from the repo's audit brief and the exact idea text in run-round.fish.
import re, sys, pathlib
repo = pathlib.Path(__file__).resolve().parents[2]
root, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
ideas = {}
for line in (repo / 'scripts/agent-ready/run-round.fish').read_text().splitlines():
    m = re.match(r'^g (\S+) "(.*)"$', line)
    if m:
        ideas[(m.group(1), '-'.join(m.group(2).split()[:2]).lower())] = m.group(2)
brief = (repo / 'scripts/agent-ready/audit-brief.md').read_text().split('\n', 2)[2]
rules = '''
Rules for this audit: this folder belongs to someone else. Do not write, create, move, or delete any file anywhere, and do not run npm, cargo, gradle, or any other build, install, or test command (the kit build is checked separately). Use only file reads and text searches. Judge only from the packet folder: do not read any other folder (not the compiler's source, not other packets). Every quote must be copied exactly from a file you read, and every 'where' must give the file name and line number so it can be checked. Report every blocking defect. Report at most 8 polish items, the most harmful first, each 'why' under 50 words.

Your final message must be only the JSON object: { slug, blocking: [{where, quote, why, fix}], polish: [{where, quote, why, fix}], verdict }.
'''
for preset in sorted(p for p in root.iterdir() if p.is_dir() and not p.name.startswith('_')):
    for packet in sorted(p for p in preset.iterdir() if p.is_dir()):
        idea = ideas.get((preset.name, packet.name))
        if idea is None:
            print('NO IDEA FOR', preset.name, packet.name); continue
        text = brief.replace('<ROOT>/<preset>/<slug>', str(packet)).replace('<preset>', preset.name).replace('<idea>', idea)
        (out / f'{preset.name}--{packet.name}.md').write_text(text + rules)
        print('ok', preset.name, packet.name)
