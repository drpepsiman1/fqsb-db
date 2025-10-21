// Favorites with localStorage (max 50), UI wiring, and search rendering
const q = document.getElementById("q");
const btn = document.getElementById("btn");
const out = document.getElementById("out");
const health = document.getElementById("health");
const favList = document.getElementById("favList");
const favCount = document.getElementById("favCount");
const exportFav = document.getElementById("exportFav");
const clearFav = document.getElementById("clearFav");

const FKEY = "fqsb:favorites"; // store [{MemberNum, FirstName, LastName, Class, Rating, PeakRating}]
const FMAX = 50;

// --- utils ---
const loadFavs = () => {
  try { return JSON.parse(localStorage.getItem(FKEY) || "[]"); }
  catch { return []; }
};
const saveFavs = (arr) => localStorage.setItem(FKEY, JSON.stringify(arr.slice(0, FMAX)));

const favIndex = (arr, mnum) => arr.findIndex(x => String(x.MemberNum) === String(mnum));
const isFav = (mnum) => favIndex(loadFavs(), mnum) >= 0;

function setFav(player, yes){
  let arr = loadFavs();
  const idx = favIndex(arr, player.MemberNum);
  if(yes){
    if(idx === -1){
      arr.unshift(player); // add to top
      if(arr.length > FMAX) arr = arr.slice(0, FMAX);
    }
  } else {
    if(idx >= 0) arr.splice(idx, 1);
  }
  saveFavs(arr);
  renderFavs();
}

// --- health check ---
async function checkHealth(){
  try{
    const r = await fetch(window.API_BASE + "/api/health", {cache:"no-store"});
    health.textContent = r.ok ? "online" : "unreachable";
    if(r.ok) health.classList.add("ok");
  }catch{
    health.textContent = "unreachable";
  }
}
checkHealth();

// --- render favorites list ---
function renderFavs(){
  const favs = loadFavs();
  favCount.textContent = `(${favs.length}/${FMAX})`;
  if(!favs.length){
    favList.innerHTML = `<div class="cap">No favorites yet. Use the ★ on a player.</div>`;
    return;
  }
  favList.innerHTML = favs.map(p => `
    <div class="fav-item">
      <div>
        <div class="fav-name">${p.FirstName ?? ""} ${p.LastName ?? ""}</div>
        <div class="fav-meta">#${p.MemberNum} • Rating ${p.Rating ?? "—"} • Peak ${p.PeakRating ?? "—"} • ${p.Class ?? "—"}</div>
      </div>
      <div class="fav-actions">
        <button class="btn" data-open="${p.MemberNum}">Open</button>
        <svg class="star fav" data-unfav="${p.MemberNum}" viewBox="0 0 24 24" fill="currentColor" aria-label="Unfavorite">
          <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.788 1.402 8.168L12 18.896l-7.336 3.87 1.402-8.168L.132 9.21l8.2-1.192z"/>
        </svg>
      </div>
    </div>
  `).join("");
}
renderFavs();

favList.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  const star = e.target.closest(".star");
  if(btn && btn.dataset.open){
    const id = btn.dataset.open;
    q.value = id;
    doSearch();
  }
  if(star && star.dataset.unfav){
    const id = star.dataset.unfav;
    setFav({MemberNum:id}, false);
  }
});

exportFav.addEventListener("click", () => {
  const favs = loadFavs();
  const blob = new Blob([JSON.stringify(favs, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "favorites.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
});
clearFav.addEventListener("click", () => {
  if(confirm("Clear all favorites?")) { saveFavs([]); renderFavs(); }
});

// --- search & results ---
function renderResults(items){
  // Show “empty” state if nothing
  if(!items?.length){
    out.innerHTML = `<div class="empty">No results. Try a different spelling or an exact member number.</div>`;
    return;
  }

  const favs = loadFavs();
  const favSet = new Set(favs.map(f => String(f.MemberNum)));

  // Show favorites first (within results) by sorting with a weight
  const sorted = items.slice().sort((a,b) => {
    const fa = favSet.has(String(a.MemberNum)) ? 0 : 1;
    const fb = favSet.has(String(b.MemberNum)) ? 0 : 1;
    return fa - fb || String(a.LastName||"").localeCompare(b.LastName||"") || String(a.FirstName||"").localeCompare(b.FirstName||"");
  });

  const cards = sorted.map(it => {
    const fullname = `${it.FirstName ?? ""} ${it.LastName ?? ""}`.trim();
    const fav = favSet.has(String(it.MemberNum));
    return `
      <div class="card" data-id="${it.MemberNum}">
        <div class="top">
          <div>
            <div class="name">${fullname || "—"}</div>
            <div class="muted">#${it.MemberNum ?? "—"}</div>
          </div>
          <svg class="star ${fav ? "fav":""}" data-star="${it.MemberNum}" viewBox="0 0 24 24" fill="currentColor" aria-label="Favorite">
            <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.788 1.402 8.168L12 18.896l-7.336 3.87 1.402-8.168L.132 9.21l8.2-1.192z"/>
          </svg>
        </div>
        <div class="badges">
          <div class="badge">Class: <strong>${it.Class ?? "—"}</strong></div>
          <div class="badge">Rating: <strong>${it.Rating ?? "—"}</strong></div>
          <div class="badge">PeakRating: <strong>${it.PeakRating ?? "—"}</strong></div>
        </div>
      </div>
    `;
  }).join("");

  out.innerHTML = `<div class="results">${cards}</div>`;
}

// toggle favorite from result card
out.addEventListener("click", (e) => {
  const star = e.target.closest("[data-star]");
  if(!star) return;
  const mnum = star.dataset.star;
  // Rebuild player payload from DOM (or cache last results globally)
  const card = star.closest(".card");
  const name = card.querySelector(".name").textContent.trim();
  const [first,...rest] = name.split(" ");
  const last = rest.join(" ");
  // Extract meta from badges
  const metas = Array.from(card.querySelectorAll(".badge strong")).map(s=>s.textContent);
  const player = {
    MemberNum: mnum,
    FirstName: first || "",
    LastName: last || "",
    Class: metas[0] || null,
    Rating: metas[1] || null,
    PeakRating: metas[2] || null,
  };

  const makeFav = !star.classList.contains("fav");
  setFav(player, makeFav);
  star.classList.toggle("fav", makeFav);
});

// perform search
async function doSearch(){
  const val = q.value.trim();
  if(!val){ renderResults([]); return; }
  btn.disabled = true;
  try{
    const r = await fetch(`${window.API_BASE}/api/search?q=${encodeURIComponent(val)}`);
    if(!r.ok){
      const t = await r.text();
      throw new Error(`API error ${r.status}: ${t}`);
    }
    const j = await r.json();
    renderResults(j.items || []);
  }catch(e){
    console.error(e);
    out.innerHTML = `<div class="empty">Could not reach the API. Check API_BASE/CORS.<br/><span class="muted">${e.message}</span></div>`;
  }finally{
    btn.disabled = false;
  }
}

btn.addEventListener("click", doSearch);
q.addEventListener("keydown", (e) => { if(e.key === "Enter") doSearch(); });
