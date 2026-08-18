import { renderCenterfold } from "./variants/centerfold.js";
import { renderCodex } from "./variants/codex.js";
import { renderContactSheet } from "./variants/contact-sheet.js";
import { renderWorkbench } from "./variants/workbench.js";

const variants = [renderWorkbench, renderCodex, renderContactSheet, renderCenterfold];
const stage = document.getElementById("stage");
const picker = document.querySelector(".proto-picker");
const highlight = picker.querySelector(".proto-picker-highlight");
const items = [...picker.querySelectorAll(".proto-picker-item:not(.proto-picker-replay)")];
const replay = picker.querySelector(".proto-picker-replay");
let current = 0;
let toastTimer;

function moveHighlight() {
  const el = items[current];
  highlight.style.width = el.offsetWidth + "px";
  highlight.style.transform = `translateX(${el.offsetLeft}px)`;
}

function mount(i) {
  stage.innerHTML = "";
  requestAnimationFrame(() => {
    stage.innerHTML = variants[i]();
    wireVariant();
  });
}

function setActive(i) {
  if (i < 0 || i >= variants.length) return;
  current = i;
  items.forEach((el, j) => {
    el.toggleAttribute("data-active", j === i);
    if (j === i) el.setAttribute("aria-current", "true");
    else el.removeAttribute("aria-current");
  });
  moveHighlight();
  const url = new URL(location);
  url.searchParams.set("v", i + 1);
  history.replaceState(null, "", url);
  mount(i);
}

function showToast(message) {
  const toast = stage.querySelector("[data-toast]");
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.toggleAttribute("data-visible", true);
  toastTimer = setTimeout(() => toast.removeAttribute("data-visible"), 1800);
}

function wireVariant() {
  stage.querySelectorAll("[data-quantity-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const output = button.parentElement?.querySelector("[data-quantity]");
      if (!output) return;
      const step = Number(button.dataset.quantityStep);
      output.textContent = String(Math.max(0, Number(output.textContent) + step));
      showToast(
        `${output.textContent} ${output.textContent === "1" ? "copy" : "copies"} in collection`,
      );
    });
  });

  stage.querySelectorAll("[data-favorite]").forEach((button) => {
    button.addEventListener("click", () => {
      const pressed = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(pressed));
      const icon = button.querySelector("b, span:last-child");
      if (icon) icon.textContent = pressed ? "★" : "☆";
      showToast(pressed ? "Pinned to your workspace" : "Removed from pinned cards");
    });
  });

  stage.querySelectorAll("[data-collect]").forEach((button) => {
    button.addEventListener("click", () => {
      const pressed = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", String(pressed));
      const label = button.querySelector("span") ?? button;
      label.textContent = pressed ? "In collection" : "Add to collection";
      showToast(pressed ? "Added to your local collection" : "Removed from your local collection");
    });
  });

  stage.querySelectorAll("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      stage
        .querySelectorAll("[data-tab]")
        .forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
      stage
        .querySelectorAll("[data-panel]")
        .forEach((panel) =>
          panel.toggleAttribute("hidden", panel.dataset.panel !== tab.dataset.tab),
        );
    });
  });

  stage.querySelectorAll("[data-printing]").forEach((printing) => {
    printing.addEventListener("click", () => {
      stage
        .querySelectorAll("[data-printing]")
        .forEach((item) => item.classList.toggle("is-selected", item === printing));
      stage.querySelectorAll("[data-edition]").forEach((label) => {
        label.textContent = printing.dataset.editionName;
      });
      showToast(`${printing.dataset.editionName} selected`);
    });
  });

  stage.querySelectorAll("[data-filter]").forEach((filter) => {
    filter.addEventListener("click", () => {
      const pressed = filter.getAttribute("aria-pressed") !== "true";
      filter.setAttribute("aria-pressed", String(pressed));
      filter.classList.toggle("is-on", pressed);
      showToast(`${filter.textContent.trim()} filter ${pressed ? "on" : "off"}`);
    });
  });

  stage.querySelector("[data-load-more]")?.addEventListener("click", (event) => {
    event.currentTarget.innerHTML =
      "<span>All prototype editions loaded</span><small>16 / 91</small>";
    event.currentTarget.disabled = true;
    showToast("Eight more editions loaded");
  });

  stage.querySelector("[data-deck]")?.addEventListener("change", (event) => {
    if (event.target.value !== "Choose a deck…") showToast(`Added to ${event.target.value}`);
  });

  stage
    .querySelector("[data-back]")
    ?.addEventListener("click", () => showToast("Returning to preserved search results"));

  const dialog = stage.querySelector("[data-art-dialog]");
  stage.querySelectorAll("[data-zoom]").forEach((button) => {
    if (button.closest("dialog")) return;
    button.addEventListener("click", () => dialog?.showModal());
  });
}

items.forEach((el, i) => el.addEventListener("click", () => setActive(i)));
replay?.addEventListener("click", () => mount(current));
window.addEventListener("resize", moveHighlight);

document.addEventListener("keydown", (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= variants.length) setActive(num - 1);
  else if (e.key === "ArrowRight") setActive((current + 1) % variants.length);
  else if (e.key === "ArrowLeft") setActive((current - 1 + variants.length) % variants.length);
  else if (e.key === "r" || e.key === "R") mount(current);
});

setActive((parseInt(new URLSearchParams(location.search).get("v"), 10) || 1) - 1);
requestAnimationFrame(() => requestAnimationFrame(() => picker.setAttribute("data-ready", "")));
