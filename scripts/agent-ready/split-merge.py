# Usage (inside a `git merge --no-commit` that conflicted): python3 scripts/agent-ready/split-merge.py <branch> <file>
# Three-way merges a file after splitting very long lines at ${ boundaries so parallel edits to one giant template line merge cleanly.
import subprocess,os,sys
branch,path=sys.argv[1],sys.argv[2]
S='\u0001'
def show(ref):
    return subprocess.run(['git','show',f'{ref}:{path}'],capture_output=True,text=True).stdout
base=subprocess.run(['git','merge-base','HEAD',branch],capture_output=True,text=True).stdout.strip()
def split(src):
    out=[]
    for l in src.split('\n'):
        if len(l)>300: l=l.replace('${',S+'\n${').replace('", "',S+'\n", "')
        out.append(l)
    return '\n'.join(out)
import tempfile; d=tempfile.mkdtemp(prefix='split-merge-')
for k,ref in (('base',base),('ours','HEAD'),('theirs',branch)):
    open(f'{d}/{k}.txt','w').write(split(show(ref)))
r=subprocess.run(['git','merge-file','-p',f'{d}/ours.txt',f'{d}/base.txt',f'{d}/theirs.txt'],capture_output=True,text=True)
open(f'{d}/merged.txt','w').write(r.stdout)
print('conflicts',r.returncode)
if r.returncode==0:
    open(path,'w').write(r.stdout.replace(S+'\n',''))
    print('written',path)
