(function () {
  var root = document.documentElement;
  var t; try { t = localStorage.getItem('theme'); } catch (e) {}
  if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.dataset.theme = t;

  function apply(x) {
    root.dataset.theme = x;
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = x === 'dark' ? '#0a0a0a' : '#ffffff';
  }
  var SUN = '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  document.addEventListener('DOMContentLoaded', function () {
    apply(root.dataset.theme);
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) {
      b.innerHTML = SUN + MOON;
      b.setAttribute('aria-label', 'Ganti tema gelap atau terang');
      b.onclick = function () {
        var n = root.dataset.theme === 'dark' ? 'light' : 'dark';
        apply(n);
        try { localStorage.setItem('theme', n); } catch (e) {}
      };
    });
  });
})();
