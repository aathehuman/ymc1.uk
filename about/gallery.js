(() => {
  const dialog = document.querySelector(".gallery-lightbox");
  if (!dialog) return;

  const largeImage = dialog.querySelector("[data-gallery-large]");
  const caption = dialog.querySelector("[data-gallery-caption]");

  document.querySelectorAll("[data-gallery-open]").forEach(button => {
    button.addEventListener("click", () => {
      const fullImage = button.dataset.full;
      const description = button.dataset.caption || "";
      const thumbnail = button.querySelector("img");

      largeImage.src = fullImage;
      largeImage.alt = thumbnail?.alt || description;
      caption.textContent = description;
      dialog.showModal();
    });
  });

  dialog.querySelector("[data-gallery-close]")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
})();
