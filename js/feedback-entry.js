const feedbackDialogEl = document.getElementById("feedback-dialog");
const feedbackContextEl = document.getElementById("feedback-context");
let feedbackReturnFocusEl = null;
let feedbackBackgroundState = [];

function openFeedbackForm(spotName = "") {
  if (!feedbackDialogEl || !feedbackDialogEl.classList.contains("is-hidden")) return;
  feedbackReturnFocusEl = document.activeElement;
  feedbackContextEl.hidden = !spotName;
  feedbackContextEl.textContent = spotName
    ? `対象スポット：${spotName}（投稿先で場所の名前をご記入ください）`
    : "";
  feedbackBackgroundState = [...document.body.children]
    .filter((el) => el !== feedbackDialogEl && !["SCRIPT", "STYLE"].includes(el.tagName))
    .map((el) => ({ el, inert: el.inert }));
  feedbackBackgroundState.forEach(({ el }) => { el.inert = true; });
  feedbackDialogEl.classList.remove("is-hidden");
  document.body.classList.add("feedback-dialog-open");
  document.getElementById("feedback-text-link")?.focus();
}

function closeFeedbackForm() {
  if (!feedbackDialogEl || feedbackDialogEl.classList.contains("is-hidden")) return;
  feedbackDialogEl.classList.add("is-hidden");
  document.body.classList.remove("feedback-dialog-open");
  feedbackBackgroundState.forEach(({ el, inert }) => { el.inert = inert; });
  feedbackBackgroundState = [];
  if (feedbackReturnFocusEl?.isConnected) feedbackReturnFocusEl.focus();
}

document.getElementById("feedback-open")?.addEventListener("click", () => openFeedbackForm());
document.getElementById("feedback-close")?.addEventListener("click", closeFeedbackForm);
feedbackDialogEl?.querySelectorAll("[data-feedback-close]").forEach((el) => {
  el.addEventListener("click", closeFeedbackForm);
});
feedbackDialogEl?.addEventListener("keydown", (event) => {
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    closeFeedbackForm();
  } else if (event.key === "Tab") {
    const elements = [...feedbackDialogEl.querySelectorAll("a[href], button:not([disabled])")];
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
