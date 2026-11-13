// Keeps the site light:
// - <img data-anim="x.gif" src="still.jpg">: the animated GIF is only shown while the image is on
//   screen; off screen it goes back to the still, so only a handful of GIFs decode at once.
// - <img data-full="big.gif" src="still.jpg">: upgrade to the full GIF once it has downloaded.
//   Very large files (or Save-Data) get a button instead of an automatic download.
const AUTO_MAX = 25e6;

const io = "IntersectionObserver" in window && new IntersectionObserver((entries) => {
  for (const { target: img, isIntersecting } of entries) {
    clearTimeout(img._t);
    if (isIntersecting) {
      img._t = setTimeout(() => {
        if (img._on) return;
        const anim = new Image();
        anim.decoding = "async";
        anim.onload = () => { if (img._wanted) { img.src = anim.src; img._on = true; } };
        img._wanted = true;
        anim.src = img.dataset.anim;
      }, 200);
    } else {
      img._wanted = false;
      if (img._on) { img._on = false; img.src = img.dataset.still; }
    }
  }
}, { rootMargin: "150px 0px" });

export function animate(img) {
  if (!io || !img.dataset.anim) return;
  img.dataset.still ||= img.getAttribute("src");
  io.observe(img);
}
document.querySelectorAll("img[data-anim]").forEach(animate);

const mb = (n) => `${(n / 1e6).toFixed(n > 1e7 ? 0 : 1)} MB`;
for (const img of document.querySelectorAll("img[data-full]")) {
  const load = () => {
    const full = new Image();
    full.decoding = "async";
    img.closest(".work-media")?.classList.add("loading");
    full.onload = () => { img.src = full.src; img.closest(".work-media")?.classList.remove("loading"); };
    full.src = img.dataset.full;
  };
  fetch(img.dataset.full, { method: "HEAD" }).then((r) => {
    const size = Number(r.headers.get("x-size") || r.headers.get("content-length") || 0);
    if (size <= AUTO_MAX && !navigator.connection?.saveData) return load();
    const b = document.createElement("button");
    b.type = "button";
    b.className = "prominent-link load-full";
    b.textContent = `▶ load full gif (${mb(size)})`;
    b.onclick = () => { b.remove(); load(); };
    img.closest(".work-media")?.append(b);
  }).catch(load);
}
