(() => {
  const DAY_ORDER = ["friday", "saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"];

  function dayRank(card) {
    const text = card.textContent.toLowerCase();
    const index = DAY_ORDER.findIndex(day => text.includes(day) || text.includes(day.slice(0, 3)));
    return index === -1 ? DAY_ORDER.length : index;
  }

  function timeRank(card) {
    const text = card.textContent.toLowerCase().replace(/[–—]/g, "-");
    const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
    if (!match) return Number.MAX_SAFE_INTEGER;

    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const period = match[3];

    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
    return hour * 60 + minute;
  }

  function sortRegularEvents() {
    const grid = document.getElementById("regular-events-grid");
    if (!grid) return;

    const cards = [...grid.querySelectorAll(".event-card")];
    if (cards.length < 2) return;

    cards.sort((a, b) => dayRank(a) - dayRank(b) || timeRank(a) - timeRank(b));
    grid.replaceChildren(...cards);
  }

  function init() {
    sortRegularEvents();
    const grid = document.getElementById("regular-events-grid");
    if (!grid) return;
    const observer = new MutationObserver(sortRegularEvents);
    observer.observe(grid, { childList: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
