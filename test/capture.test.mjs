import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCapture, setCaptureProject, setCaptureStatus } from '../src/capture.js';

const projects = [
  { id: 'example', name: 'Example App' },
  { id: 'other', name: 'Other Project' },
  { id: 'reading', name: 'Čtení & nápady' }
];

test('captures a Today idea and lets an exact tag override a selected default project', () => {
  const result = parseCapture('/today build iphone animation #example app', projects, { projectId: 'other' });
  assert.equal(result.title, 'build iphone animation');
  assert.equal(result.status, 'today');
  assert.equal(result.projectId, 'example');
  assert.equal(result.projectMatch.kind, 'exact');
  assert.equal(result.projectMatch.resolved, true);
});

test('accepts capture command serializers without treating ordinary text as commands', () => {
  for (const command of ['/todo', '/backlog', '$todo', '$backlog', '$codex-todo:todo', '/codex-todo:todo']) {
    assert.equal(parseCapture(`${command} investigate timing`, projects, { defaultStatus: 'today' }).status, 'backlog');
    assert.equal(parseCapture(`${command} investigate timing`, projects).title, 'investigate timing');
  }
  assert.equal(parseCapture('$today\nSketch a scene', projects).status, 'today');
  const bundled = parseCapture('$codex-todo:today Build animation #example app', projects);
  assert.equal(bundled.status, 'today');
  assert.equal(bundled.title, 'Build animation');
  assert.equal(bundled.projectId, 'example');
  assert.equal(parseCapture('/Today\tSketch a scene', projects).title, 'Sketch a scene');
  assert.equal(parseCapture('/todayish investigate timing', projects).title, '/todayish investigate timing');
  assert.equal(parseCapture('Budget $today illustration', projects).title, 'Budget $today illustration');
});

test('matches full multiword names with Unicode, case, whitespace, quote, and slug variations', () => {
  for (const tag of ['#EXAMPLE\u00a0 APP', '#Ｅｘａｍｐｌｅ Ａｐｐ', '#"example app"', '#“example app”', '#example-app']) {
    const result = parseCapture(`  Build animation   ${tag}  `, projects);
    assert.equal(result.title, 'Build animation');
    assert.equal(result.projectId, 'example');
    assert.equal(result.projectMatch.resolved, true);
  }
  const accented = parseCapture('Save an idea #C\u030cteni\u0301 & na\u0301pady', projects);
  assert.equal(accented.projectId, 'reading');
  assert.equal(accented.title, 'Save an idea');
});

test('project-less captures preserve ordinary title words, code, and issue references', () => {
  for (const text of ['Review Example App animation', 'Investigate C# compiler', 'Fix issue #1', 'Check #123 timing', 'Find #! shell behavior']) {
    const result = parseCapture(text, projects);
    assert.equal(result.title, text);
    assert.equal(result.projectId, null);
    assert.equal(result.projectMatch, null);
    assert.equal(result.status, 'backlog');
  }
  const selected = parseCapture('Write release notes', projects, { projectId: 'other', defaultStatus: 'inbox' });
  assert.equal(selected.projectId, 'other');
  assert.equal(selected.status, 'inbox');
  assert.equal(selected.projectMatch, null);
  const taggedIssue = parseCapture('Fix #1 #example app', projects);
  assert.equal(taggedIssue.title, 'Fix #1');
  assert.equal(taggedIssue.projectId, 'example');
});

test('unique prefix and typo suggestions require a matching explicit selection', () => {
  for (const [tag, kind] of [['#exam', 'prefix'], ['#example appp', 'fuzzy']]) {
    const pending = parseCapture(`Build animation ${tag}`, projects);
    assert.equal(pending.title, 'Build animation');
    assert.equal(pending.projectId, null);
    assert.equal(pending.projectMatch.kind, kind);
    assert.equal(pending.projectMatch.resolved, false);
    assert.deepEqual(pending.projectMatch.candidates, [{ id: 'example', name: 'Example App' }]);
    const wrong = parseCapture(`Build animation ${tag}`, projects, { projectId: 'other' });
    assert.equal(wrong.projectId, null);
    assert.equal(wrong.projectMatch.resolved, false);
    const confirmed = parseCapture(`Build animation ${tag}`, projects, { projectId: 'example' });
    assert.equal(confirmed.projectId, 'example');
    assert.equal(confirmed.projectMatch.resolved, true);
    assert.equal(confirmed.title, 'Build animation');
  }
});

test('unknown and incomplete tags remain literal and unresolved without inferring a project', () => {
  for (const text of ['Review the launch #unknown', 'Discuss #unrelated with Anna', 'Build animation #ex', 'Build animation #"example app']) {
    const result = parseCapture(text, projects, { projectId: 'example' });
    assert.equal(result.title, text);
    assert.equal(result.projectId, null);
    assert.equal(result.projectMatch.kind, 'unknown');
    assert.equal(result.projectMatch.resolved, false);
    assert.deepEqual(result.projectMatch.candidates, []);
  }
});

test('overlapping names and duplicate exact names surface ambiguity until a candidate is chosen', () => {
  const overlapping = [...projects, { id: 'example-ios', name: 'Example App iOS' }];
  const prefix = parseCapture('Work on animation #example', overlapping);
  assert.equal(prefix.projectMatch.kind, 'ambiguous');
  assert.equal(prefix.projectMatch.matchKind, 'prefix');
  assert.equal(prefix.projectMatch.resolved, false);
  assert.deepEqual(prefix.projectMatch.candidates.map(item => item.id), ['example', 'example-ios']);
  assert.equal(parseCapture('Work on animation #example app', overlapping).projectId, 'example');
  const duplicates = [...projects, { id: 'duplicate', name: 'EXAMPLE-APP' }];
  const exact = parseCapture('Work on animation #example app', duplicates);
  assert.equal(exact.projectMatch.kind, 'ambiguous');
  assert.equal(exact.projectMatch.matchKind, 'exact');
  assert.equal(exact.projectMatch.resolved, false);
  const confirmed = parseCapture('Work on animation #example app', duplicates, { projectId: 'duplicate' });
  assert.equal(confirmed.projectId, 'duplicate');
  assert.equal(confirmed.projectMatch.resolved, true);
});

test('multiple project tags remain visible and cannot silently choose the last match', () => {
  const result = parseCapture('/today Build animation #example app #other', projects, { projectId: 'other' });
  assert.equal(result.title, 'Build animation #example app #other');
  assert.equal(result.status, 'today');
  assert.equal(result.projectId, null);
  assert.equal(result.projectMatch.kind, 'ambiguous');
  assert.equal(result.projectMatch.reason, 'multiple-tags');
  assert.equal(result.projectMatch.resolved, false);
});

test('fuzzy matching stays bounded and exposes at most three candidates', () => {
  const similar = ['abcd', 'abce', 'abcf', 'abcg'].map((name, index) => ({ id: String(index), name }));
  const result = parseCapture('Check typography #abch', similar);
  assert.equal(result.projectMatch.kind, 'ambiguous');
  assert.equal(result.projectMatch.matchKind, 'fuzzy');
  assert.equal(result.projectMatch.candidates.length, 3);
  assert.equal(result.projectMatch.totalCandidates, 4);
  assert.equal(result.projectId, null);
  assert.equal(parseCapture('Check typography #az', similar).projectMatch.kind, 'unknown');
  assert.equal(parseCapture('Check typography #unrelated', similar).projectMatch.kind, 'unknown');
});

test('project picker changes replace or remove the existing annotation while preserving the idea and command', () => {
  const draft = '/today Build animation\nKeep the timing gentle. #example-app  ';
  const replacement = setCaptureProject(draft, 'Other Project', projects);
  assert.equal(replacement, '/today Build animation\nKeep the timing gentle. #Other Project');
  const parsed = parseCapture(replacement, projects, { projectId: 'other' });
  assert.equal(parsed.title, 'Build animation\nKeep the timing gentle.');
  assert.equal(parsed.status, 'today');
  assert.equal(parsed.projectId, 'other');
  assert.equal(setCaptureProject(draft, null, projects), '/today Build animation\nKeep the timing gentle.');
  assert.equal(setCaptureProject('Fix #1 #example-ap', 'Other Project', projects), 'Fix #1 #Other Project');
  assert.equal(setCaptureProject('Idea #"example app', 'Example App', projects), 'Idea #Example App');
  for (const literal of ['  Write an idea  ', 'Investigate C#', 'Fix issue #1', 'Check #123 timing']) {
    assert.equal(setCaptureProject(literal, 'Other Project'), literal);
    assert.equal(setCaptureProject(literal, null), literal);
  }
});

test('project labels only resolve exact typed tags and picker changes repair incomplete tags', () => {
  const exact = parseCapture('Build animation #example-app', projects);
  assert.equal(exact.projectId, 'example');
  const partial = parseCapture('Build animation #example-ap', projects);
  assert.equal(partial.projectId, null);
  assert.equal(partial.projectMatch.resolved, false);
  const confirmed = setCaptureProject('Build animation #example-ap', 'Example App', projects);
  assert.equal(confirmed, 'Build animation #Example App');
  assert.equal(parseCapture(confirmed, projects).projectId, 'example');
  const unusual = 'Research # reference';
  assert.equal(setCaptureProject('Idea #example app', unusual, projects), 'Idea');
  assert.equal(parseCapture('Idea', [{ id: 'unusual', name: unusual }], { projectId: 'unusual' }).projectId, 'unusual');
});

test('list picker updates existing command directives so the label and saved destination agree', () => {
  for (const prefix of ['/today', '$today', '$codex-todo:today', '/codex-todo:today']) {
    const updated = setCaptureStatus(` ${prefix} Build animation #example app`, 'backlog');
    assert.equal(parseCapture(updated, projects, { defaultStatus: 'today' }).status, 'backlog');
    assert.equal(parseCapture(updated, projects).title, 'Build animation');
    assert.equal(updated.includes('codex-todo:'), prefix.includes('codex-todo:'));
  }
  assert.equal(setCaptureStatus('/todo\nBuild animation', 'today'), '/today\nBuild animation');
  assert.equal(setCaptureStatus('/backlog Build animation', 'today'), '/today Build animation');
  for (const literal of ['  Build animation  ', '/todayish investigate', 'Budget $today illustration']) assert.equal(setCaptureStatus(literal, 'today'), literal);
  assert.throws(() => setCaptureStatus('Idea', 'done'), TypeError);
});

test('an explicit project-picker choice resolves multiple project annotations without retaining a conflicting tag', () => {
  const draft = '/today Fix #1 #example app #other';
  const cleared = setCaptureProject(draft, null, projects);
  assert.equal(cleared, '/today Fix #1');
  assert.equal(parseCapture(cleared, projects).projectId, null);
  const changed = setCaptureProject(draft, 'Other Project', projects);
  assert.equal(changed, '/today Fix #1 #Other Project');
  assert.equal(parseCapture(changed, projects).projectId, 'other');
});

test('changing project preserves unknown multiword hashtag tails as idea text', () => {
  const draft = 'Discuss #unrelated topic with Anna';
  const changed = setCaptureProject(draft, 'Example App', projects);
  assert.equal(changed, 'Discuss unrelated topic with Anna #Example App');
  assert.equal(parseCapture(changed, projects).title, 'Discuss unrelated topic with Anna');
  assert.equal(parseCapture(changed, projects).projectId, 'example');
  assert.equal(setCaptureProject(draft, null, projects), 'Discuss unrelated topic with Anna');
  const multiple = setCaptureProject('Discuss #unrelated topic with Anna #other', null, projects);
  assert.equal(multiple, 'Discuss unrelated topic with Anna');
});


test('exact project tags resolve at the beginning, middle, or end without changing surrounding prose', () => {
  for (const [text, title] of [
    ['#example-app Build animation', 'Build animation'],
    ['Build #example app animation', 'Build animation'],
    ['Discuss #"Example App" with Anna', 'Discuss with Anna'],
    ['Discuss #“Example App” with Anna', 'Discuss with Anna'],
    ['Build animation #example-app', 'Build animation'],
    ['Build animation #example app extra words', 'Build animation extra words'],
    ['Review #example-app, then continue.', 'Review, then continue.'],
    ['Fix #example app issue #1', 'Fix issue #1']
  ]) {
    const result = parseCapture(text, projects);
    assert.equal(result.projectId, 'example', text);
    assert.equal(result.projectMatch.kind, 'exact', text);
    assert.equal(result.title, title, text);
    assert.equal(text.slice(result.projectMatch.start, result.projectMatch.end), result.projectMatch.tag);
    assert.deepEqual(result.projectMatch.ranges, [{ start: result.projectMatch.start, end: result.projectMatch.end }]);
  }
});

test('the longest complete known project name wins over a shorter exact name', () => {
  const overlapping = [...projects, { id: 'short', name: 'Example' }, { id: 'ios', name: 'Example App iOS' }];
  assert.equal(parseCapture('#Example App iOS Build animation', overlapping).projectId, 'ios');
  assert.equal(parseCapture('Build #Example App animation', overlapping).projectId, 'example');
  assert.equal(parseCapture('Build #Example animation', overlapping).projectId, 'short');
  assert.equal(parseCapture('Build #Example-App-iOS animation', overlapping).projectId, 'ios');
});

test('near-prefix continuations and exact-to-partial edits do not silently assign an inline project', () => {
  for (const tag of ['#example-apps', '#example-app-extra', '#example-ap', '#example-apz', '#"Example App"-extra']) {
    const result = parseCapture(`Build ${tag} animation`, projects);
    assert.equal(result.projectId, null, tag);
    assert.equal(result.projectMatch.resolved, false, tag);
    assert.deepEqual(result.projectMatch.ranges, [], tag);
  }
  assert.equal(parseCapture('Build #example-app animation', projects).projectId, 'example');
  assert.equal(parseCapture('Build #example-ap animation', projects).projectId, null);
});

test('tag ranges use original UTF-16 offsets after leading spaces, commands, Unicode and newlines', () => {
  const input = '  /today 🚀 Build\n#Ｅｘａｍｐｌｅ Ａｐｐ\nThen test it.  ';
  const result = parseCapture(input, projects);
  assert.equal(result.projectId, 'example');
  assert.equal(result.status, 'today');
  assert.equal(result.title, '🚀 Build\nThen test it.');
  assert.equal(result.projectMatch.start, input.indexOf('#'));
  assert.equal(result.projectMatch.end, input.indexOf('\nThen'));
  assert.equal(input.slice(result.projectMatch.ranges[0].start, result.projectMatch.ranges[0].end), '#Ｅｘａｍｐｌｅ Ａｐｐ');
});

test('multiple project annotations remain ambiguous wherever they occur, including repeated tags', () => {
  for (const text of ['#example-app Build #other project animation', 'Build #example-app animation #example-app', 'Build #unknown animation #example-app']) {
    const result = parseCapture(text, projects, { projectId: 'example' });
    assert.equal(result.title, text);
    assert.equal(result.projectId, null);
    assert.equal(result.projectMatch.reason, 'multiple-tags');
    assert.equal(result.projectMatch.resolved, false);
  }
});

test('project picker rewrites only inline annotation spans and preserves task prose and newlines', () => {
  const input = '/today Build #example app animation\nKeep the timing gentle.';
  const changed = setCaptureProject(input, 'Other Project', projects);
  assert.equal(changed, '/today Build animation\nKeep the timing gentle. #Other Project');
  const parsed = parseCapture(changed, projects);
  assert.equal(parsed.projectId, 'other');
  assert.equal(parsed.title, 'Build animation\nKeep the timing gentle.');
  assert.equal(setCaptureProject(input, null, projects), '/today Build animation\nKeep the timing gentle.');
  assert.equal(setCaptureProject('Build\n#example-app\nThen test', null, projects), 'Build\nThen test');
  assert.equal(setCaptureProject('Fix #example app issue #1', null, projects), 'Fix issue #1');
  assert.equal(setCaptureProject('Discuss #unknown topic with Anna', null, projects), 'Discuss unknown topic with Anna');
});


test('editing a longer spaced project name does not silently fall back to its shorter exact project', () => {
  const overlapping = [...projects, { id: 'short', name: 'Example' }, { id: 'ios', name: 'Example App iOS' }];
  for (const text of ['Build #Example Ap animation', 'Build #Example App iO animation']) {
    const result = parseCapture(text, overlapping, { projectId: 'short' });
    assert.equal(result.projectId, null, text);
    assert.equal(result.projectMatch.resolved, false, text);
    assert.deepEqual(result.projectMatch.ranges, [], text);
  }
  assert.equal(parseCapture('Build #Example build animation', overlapping).projectId, 'short');
  assert.equal(parseCapture('Build #Example App animation', overlapping).projectId, 'example');
  assert.equal(parseCapture('Build #Example App iOS animation', overlapping).projectId, 'ios');
  assert.equal(parseCapture('Build #Example, App animation', overlapping).projectId, 'short');
  assert.equal(parseCapture('Build #"Example" Ap animation', overlapping).projectId, 'short');
  assert.equal(parseCapture(setCaptureProject('Build #Example Ap animation', 'Other Project', overlapping), overlapping).title, 'Build animation');
});
