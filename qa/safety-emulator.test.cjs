const {test} = require('node:test');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
test('real backend panic and medication transactions deduplicate concurrently',()=>{
  const backend = path.resolve('../backend');
  const localPython = path.join(backend,'venv','Scripts','python.exe');
  const python = fs.existsSync(localPython) ? localPython : 'python';
  const result = spawnSync(python,['-m','unittest','discover','-s','tests','-p','test_safety_emulator.py','-v'],{
    cwd:backend,env:{...process.env,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8087'},encoding:'utf8',timeout:600000
  });
  console.log(result.stdout || '');
  assert.equal(result.status,0,result.stderr || String(result.error));
});

test('real regression transactions preserve concurrent logs and deduplicate retries',()=>{
  const backend = path.resolve('../backend');
  const localPython = path.join(backend,'venv','Scripts','python.exe');
  const result = spawnSync(fs.existsSync(localPython) ? localPython : 'python',
    ['-m','unittest','discover','-s','tests','-p','test_regression_emulator.py','-v'],
    {cwd:backend,env:{...process.env,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8087'},encoding:'utf8',timeout:600000});
  assert.equal(result.status,0,result.stderr || String(result.error));
});
