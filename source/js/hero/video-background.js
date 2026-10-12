/* A decoded DOM video sits behind the transparent character canvas.
 * It needs no texture uploads or second animation loop. Files contain no audio.
 */
export function createVideoBackground(stage, { compact = false } = {}) {
  const video = document.createElement('video');
  video.className = 'hero-recording';
  video.poster = '/img/fontaine-recording-poster-v1.webp';
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.tabIndex = -1;
  stage.prepend(video);

  let active = false, visible = false, started = false;
  let failed = false, blocked = false, playing = false, disposed = false;
  let suspended = false;
  const poster = new Image();
  poster.onload = () => { active = true; };
  poster.src = video.poster;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function sync() {
    const wanted = visible && !document.hidden && !suspended && !disposed &&
      !failed && !blocked && !reduced.matches;
    if (!wanted) {
      if (!video.paused) video.pause();
      playing = false;
      return;
    }
    if (!started) {
      started = true;
      video.src = compact ? '/img/fontaine-recording-mobile-v1.mp4'
        : '/img/fontaine-recording-desktop-v1.mp4';
    }
    if (playing) return;
    playing = true;
    video.play().catch((error) => {
      playing = false;
      // A pause while play() is pending is expected when leaving the hero.
      if (error.name !== 'AbortError') blocked = true;
    });
  }
  function onPlayable() { active = true; }
  function onError() { failed = true; sync(); }
  function retry() { if (blocked) { blocked = false; sync(); } }
  function pageHide() { suspended = true; sync(); }
  function pageShow() { suspended = false; sync(); }
  video.addEventListener('loadeddata', onPlayable);
  video.addEventListener('error', onError);
  document.addEventListener('visibilitychange', sync);
  document.addEventListener('pointerdown', retry, { passive: true });
  reduced.addEventListener('change', sync);
  window.addEventListener('pagehide', pageHide);
  window.addEventListener('pageshow', pageShow);

  return {
    get active() { return active; },
    setVisible(value) { if (visible !== value) { visible = value; sync(); } },
    dispose() {
      disposed = true;
      sync();
      poster.onload = null;
      video.removeEventListener('loadeddata', onPlayable);
      video.removeEventListener('error', onError);
      document.removeEventListener('visibilitychange', sync);
      document.removeEventListener('pointerdown', retry);
      reduced.removeEventListener('change', sync);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('pageshow', pageShow);
      video.removeAttribute('src');
      video.load();
      video.remove();
    },
  };
}
