const quotePairs = new Map([['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’']]);
const statuses = new Set(['inbox', 'today', 'backlog', 'done']);

function projectKey(value) {
  return value.normalize('NFKC').toLowerCase().replace(/ς/gu, 'σ').replace(/[\p{White_Space}\p{Dash_Punctuation}]+/gu, '');
}

function distance(left, right) {
  const a = [...left];
  const b = [...right];
  const rows = [Array.from({ length: b.length + 1 }, (_, index) => index)];
  for (let i = 1; i <= a.length; i += 1) {
    rows[i] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const replacement = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + replacement);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

function findMatches(query, projects) {
  const key = projectKey(query);
  const exact = projects.filter(project => project.key === key);
  if (exact.length > 0) return { kind: 'exact', projects: exact };
  const length = [...key].length;
  if (length < 3) return { kind: 'unknown', projects: [] };
  const prefixes = projects.filter(project => project.key.startsWith(key));
  if (prefixes.length > 0) return { kind: 'prefix', projects: prefixes };
  const limit = length >= 8 ? 2 : 1;
  const fuzzy = projects.flatMap(project => {
    if (Math.abs([...project.key].length - length) > limit) return [];
    const score = distance(key, project.key);
    return score <= limit ? [{ project, score }] : [];
  }).sort((a, b) => a.score - b.score || a.project.index - b.project.index);
  return { kind: fuzzy.length > 0 ? 'fuzzy' : 'unknown', projects: fuzzy.map(item => item.project) };
}

function candidates(projects) {
  return projects.slice(0, 3).map(({ id, name }) => ({ id, name }));
}

function tagBoundary(value) {
  return value === undefined || /[\p{White_Space}.,!?;:()[\]{}]/u.test(value);
}

function removeRange(value, start, end) {
  let left = value.slice(0, start);
  let right = value.slice(end);
  if (/[ \t]$/u.test(left) && /^(?:\r?\n|[.,!?;:])/u.test(right)) left = left.replace(/[ \t]+$/u, '');
  else if (/[ \t]$/u.test(left) && /^[ \t]/u.test(right)) right = right.replace(/^[ \t]+/u, '');
  else if (/\r?\n$/u.test(left) && /^\r?\n/u.test(right)) right = right.replace(/^\r?\n/u, '');
  return `${left}${right}`;
}

function inspectCapture(text, projects, defaultStatus = 'backlog') {
  const source = typeof text === 'string' ? text : '';
  let title = source.trim();
  let offset = source.length - source.trimStart().length;
  let status = statuses.has(defaultStatus) ? defaultStatus : 'backlog';
  const command = title.match(/^[/$](?:codex-todo:)?(today|todo|backlog)(?=\s|$)/iu);
  if (command) {
    status = command[1].toLowerCase() === 'today' ? 'today' : 'backlog';
    const rest = title.slice(command[0].length);
    offset += command[0].length + rest.length - rest.trimStart().length;
    title = rest.trim();
  }
  const saved = (Array.isArray(projects) ? projects : []).filter(project => typeof project?.id === 'string' && typeof project?.name === 'string' && project.name.trim()).map((project, index) => ({ id: project.id, name: project.name, key: projectKey(project.name), index }));
  const maxKeyLength = Math.max(0, ...saved.map(project => project.key.length));
  const markers = [...title.matchAll(/(^|[\s([{])#/gu)].map(match => match.index + match[1].length);
  const annotations = [];
  for (const [index, hash] of markers.entries()) {
    const segmentEnd = markers[index + 1] ?? title.length;
    const raw = title.slice(hash + 1, segmentEnd);
    const leading = raw.length - raw.trimStart().length;
    const value = raw.trim();
    if (!value) continue;
    const quote = quotePairs.get(value[0]);
    let query;
    let length;
    let match;
    if (quote) {
      const close = value.indexOf(quote, 1);
      const wellFormed = close !== -1 && tagBoundary(value[close + 1]);
      query = (close === -1 ? value.slice(1) : value.slice(1, close)).trim();
      length = close === -1 ? value.length : close + 1;
      match = wellFormed ? findMatches(query, saved) : { kind: 'unknown', projects: [] };
    } else {
      if (!/^\p{L}/u.test(value.normalize('NFKC'))) continue;
      for (let end = 1; end <= value.length; end++) {
        if (!tagBoundary(value[end]) || /\p{White_Space}/u.test(value[end - 1])) continue;
        const candidate = value.slice(0, end);
        const key = projectKey(candidate);
        if (key.length > maxKeyLength) break;
        const exact = saved.filter(project => project.key === key);
        if (exact.length) {
          query = candidate;
          length = end;
          match = { kind: 'exact', projects: exact };
        }
      }
      if (match && /\p{White_Space}/u.test(value[length] ?? '')) {
        const exactLength = length;
        const exactKey = projectKey(query);
        const longer = saved.filter(project => project.key.length > exactKey.length && project.key.startsWith(exactKey));
        for (let end = exactLength + 1; longer.length && end <= value.length; end++) {
          if (!tagBoundary(value[end]) || /\p{White_Space}/u.test(value[end - 1])) continue;
          const candidate = value.slice(0, end);
          const key = projectKey(candidate);
          const prefixes = longer.filter(project => project.key.length > key.length && project.key.startsWith(key));
          if (!prefixes.length) break;
          query = candidate;
          length = end;
          match = { kind: 'prefix', projects: prefixes };
        }
      }
      if (!match) {
        const token = value.match(/^[^\p{White_Space}.,!?;:()[\]{}]+/u)?.[0] ?? value;
        const complete = findMatches(value, saved);
        query = complete.kind === 'unknown' ? token : value;
        length = query.length;
        match = complete.kind === 'unknown' ? findMatches(token, saved) : complete;
      }
    }
    const start = offset + hash;
    const end = start + 1 + leading + length;
    annotations.push({ query, match, replaceable: match.kind !== 'unknown' || Boolean(quote && findMatches(query, saved).kind !== 'unknown'), start, end, tag: source.slice(start, end), bodyStart: hash, bodyEnd: hash + 1 + leading + length });
  }
  return { source, title, status, annotations };
}

export function parseCapture(text, projects = [], { defaultStatus = 'backlog', projectId = null } = {}) {
  const { title, status, annotations } = inspectCapture(text, projects, defaultStatus);
  const result = { title, status, projectId, projectMatch: null };
  const annotation = annotations.at(-1);
  if (!annotation) return result;
  const ranges = annotations.filter(item => item.match.kind === 'exact').map(({ start, end }) => ({ start, end }));
  if (annotations.length > 1) {
    const matches = annotations.flatMap(item => item.match.projects);
    const unique = [...new Map(matches.map(project => [project.id, project])).values()];
    return { ...result, projectId: null, projectMatch: { query: annotation.query, kind: 'ambiguous', candidates: candidates(unique), resolved: false, requiresConfirmation: true, reason: 'multiple-tags', tag: annotation.tag, start: annotation.start, end: annotation.end, ranges } };
  }
  const { match, query, tag, start, end } = annotation;
  const unique = [...new Map(match.projects.map(project => [project.id, project])).values()];
  const selected = unique.find(project => project.id === projectId);
  const resolved = match.kind === 'exact' && unique.length === 1 ? unique[0] : selected;
  const kind = unique.length > 1 ? 'ambiguous' : match.kind;
  const projectMatch = {
    query,
    kind,
    candidates: candidates(unique),
    resolved: Boolean(resolved),
    requiresConfirmation: !resolved,
    tag,
    start,
    end,
    ranges,
    ...(kind === 'ambiguous' ? { matchKind: match.kind, totalCandidates: unique.length } : {}),
    ...(resolved ? { selectedId: resolved.id } : {})
  };
  return {
    ...result,
    title: match.kind === 'unknown' ? title : removeRange(title, annotation.bodyStart, annotation.bodyEnd).trim(),
    projectId: resolved?.id ?? null,
    projectMatch
  };
}

export function setCaptureProject(text, projectName, projects = []) {
  const { source, annotations } = inspectCapture(text, projects);
  if (!annotations.length) return source;
  let prefix = source;
  for (const annotation of annotations.toReversed()) {
    prefix = removeRange(prefix, annotation.start, annotation.replaceable ? annotation.end : annotation.start + 1);
  }
  prefix = prefix.trimEnd();
  if (typeof projectName !== 'string' || !projectName.trim()) return prefix;
  const name = projectName.trim();
  const tag = /^\p{L}/u.test(name.normalize('NFKC')) ? `#${name}` : `#"${name}"`;
  const represented = parseCapture(tag, [{ id: 'selected', name }]);
  if (represented.projectId !== 'selected' || represented.title) return prefix;
  return `${prefix}${prefix ? ' ' : ''}${tag}`;
}

export function setCaptureStatus(text, status) {
  if (!['today', 'backlog'].includes(status)) throw new TypeError('Choose Today or Backlog.');
  const value = typeof text === 'string' ? text : '';
  return value.replace(/^(\s*[/$](?:codex-todo:)?)(today|todo|backlog)(?=\s|$)/iu, (_, prefix) => `${prefix}${status === 'today' ? 'today' : 'todo'}`);
}
