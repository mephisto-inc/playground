const loadingMessage = document.getElementById("loading-message");

export function showLoadingError() {
  if (!loadingMessage || loadingMessage.classList.contains("hidden")) return;
  loadingMessage.textContent =
    "Unable to start the game. Please refresh to try again.";
  loadingMessage.classList.add("load-error");
}

export function hideLoadingMessage() {
  loadingMessage?.classList.add("hidden");
}

window.addEventListener("error", showLoadingError, true);
window.addEventListener("unhandledrejection", showLoadingError);
