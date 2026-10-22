export function startTaskCompletion(row) {
  const title = row.querySelector('.task-title');
  const animations = new Set();
  const strokes = [];
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  let cancelled = false;
  let resizeObserver;

  function animate(node, frames, options) {
    if (cancelled || !node.animate) return Promise.resolve();
    const animation = node.animate(frames, { ...options, fill: 'both' });
    animations.add(animation);
    return animation.finished.catch(() => {});
  }

  function finishStrike() {
    for (const animation of animations) animation.finish();
    title.classList.add('is-struck');
    for (const stroke of strokes) stroke.remove();
    resizeObserver?.disconnect();
  }

  function reduceMotion() {
    if (!motion.matches) finishStrike();
  }

  async function strike() {
    if (!motion.matches || !title.animate) {
      title.classList.add('is-struck');
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(title);
    const bounds = title.getBoundingClientRect();
    const lines = Array.from(range.getClientRects()).filter(rect => rect.width > 0);
    const totalWidth = lines.reduce((sum, rect) => sum + rect.width, 0);
    const duration = Math.min(800, Math.max(600, title.textContent.length * 12));
    let elapsed = 0;
    const finished = lines.map(rect => {
      const stroke = document.createElement('span');
      stroke.className = 'task-strike';
      stroke.setAttribute('aria-hidden', 'true');
      stroke.style.insetInlineStart = `${rect.left - bounds.left}px`;
      stroke.style.insetBlockStart = `${rect.top - bounds.top + rect.height / 2}px`;
      stroke.style.inlineSize = `${rect.width}px`;
      title.append(stroke);
      strokes.push(stroke);
      const lineDuration = duration * rect.width / totalWidth;
      const finished = animate(stroke, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: lineDuration, delay: elapsed, easing: 'linear' });
      elapsed += lineDuration;
      return finished;
    });
    resizeObserver = new ResizeObserver(() => {
      if (Math.abs(title.getBoundingClientRect().width - bounds.width) > 0.5) finishStrike();
    });
    resizeObserver.observe(title);
    motion.addEventListener('change', reduceMotion);
    await Promise.all(finished);
    if (!cancelled) finishStrike();
  }

  row.classList.add('is-completing');
  return {
    finished: strike(),
    async collapse() {
      if (cancelled || !row.isConnected) return;
      row.classList.add('is-collapsing');
      if (!motion.matches) {
        await animate(row, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease' });
        return;
      }
      const height = row.getBoundingClientRect().height;
      const styles = getComputedStyle(row);
      await animate(row, [
        { blockSize: `${height}px`, paddingBlockStart: styles.paddingBlockStart, paddingBlockEnd: styles.paddingBlockEnd, borderBlockStartWidth: styles.borderBlockStartWidth, opacity: 1 },
        { blockSize: '0px', paddingBlockStart: '0px', paddingBlockEnd: '0px', borderBlockStartWidth: '0px', opacity: 0 }
      ], { duration: 330, easing: styles.getPropertyValue('--ease-out').trim() });
    },
    cancel() {
      cancelled = true;
      resizeObserver?.disconnect();
      motion.removeEventListener('change', reduceMotion);
      for (const animation of animations) animation.cancel();
      for (const stroke of strokes) stroke.remove();
      row.classList.remove('is-completing', 'is-collapsing');
      title.classList.remove('is-struck');
    }
  };
}
