/* 毛孩商店街共用小動畫：捲到哪裡、哪裡的內容就淡入（.reveal）。
   有開「減少動態效果」的使用者，直接全部顯示。 */
(function () {
  var items = document.querySelectorAll(".reveal");
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("in"); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  items.forEach(function (el, i) {
    el.style.transitionDelay = (el.dataset.delay || 0) + "ms";
    io.observe(el);
  });
})();
