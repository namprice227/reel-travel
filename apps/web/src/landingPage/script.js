/* Progressive enhancement only: copy, navigation, pricing and app links work without JavaScript. */
"use strict";
document.documentElement.classList.add("js");
const menu = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#navigation");
if (menu && navigation) {
  menu.hidden = false;
  const closeMenu = () => {
    menu.setAttribute("aria-expanded", "false");
    navigation.classList.remove("is-open");
  };
  menu.addEventListener("click", () => {
    const expanded = menu.getAttribute("aria-expanded") !== "true";
    menu.setAttribute("aria-expanded", String(expanded));
    navigation.classList.toggle("is-open", expanded);
  });
  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      menu.getAttribute("aria-expanded") === "true"
    ) {
      closeMenu();
      menu.focus();
    }
  });
}
const sampleDays = [
  [
    [
      "09:30",
      "A slow garden morning",
      "A little green before the city wakes up",
    ],
    ["12:00", "Lunch in the neighbourhood", "A pause, close to your next stop"],
    ["14:00", "An afternoon of art", "Leave time for the unexpected"],
  ],
  [
    ["10:00", "A neighbourhood wander", "Take the scenic way through the city"],
    ["12:30", "A market lunch", "Make a little room for something new"],
    [
      "19:30",
      "The dinner you booked",
      "A fixed booking, right where you left it",
    ],
  ],
  [
    ["09:00", "One last café morning", "Coffee, a notebook, nowhere to rush"],
    ["11:00", "A few favourite shops", "Something small to bring home"],
    ["14:00", "An afternoon left open", "Because not every hour needs a plan"],
  ],
];
const buttons = [...document.querySelectorAll("[data-day]")];
const sample = document.querySelector("#sample-day");
buttons.forEach((button, index) => {
  button.hidden = false;
  button.addEventListener("click", () => {
    if (!sample) return;
    buttons.forEach((other) => {
      const active = other === button;
      other.classList.toggle("is-active", active);
      other.setAttribute("aria-pressed", String(active));
    });
    const list = document.createElement("ol");
    list.className = "sample-stops";
    sampleDays[index].forEach(([time, title, description], stopIndex) => {
      const row = document.createElement("li");
      const clock = document.createElement("time");
      clock.textContent = time;
      const dot = document.createElement("span");
      dot.className = `stop-dot ${["sage", "peach", "blue"][stopIndex]}`;
      const copy = document.createElement("div");
      const heading = document.createElement("strong");
      heading.textContent = title;
      const detail = document.createElement("span");
      detail.textContent = description;
      copy.append(heading, detail);
      row.append(clock, dot, copy);
      list.append(row);
    });
    sample.replaceChildren(list);
  });
});
const year = document.querySelector("#year");
if (year) year.textContent = String(new Date().getFullYear());
const shareButton = document.querySelector("#share-page");
const shareStatus = document.querySelector("#share-status");
if (
  shareButton &&
  shareStatus &&
  (navigator.share || navigator.clipboard?.writeText)
) {
  shareButton.hidden = false;
  shareButton.addEventListener("click", async () => {
    const url = new URL(window.location.href);
    url.hash = "";
    url.search = "";
    try {
      if (navigator.share)
        await navigator.share({
          title: "Routelet — Less scrolling. More going.",
          text: "Turn saved travel inspiration into your next trip.",
          url: url.href,
        });
      else {
        await navigator.clipboard.writeText(url.href);
        shareStatus.textContent =
          "Link copied. Send a little inspiration someone’s way.";
      }
    } catch (error) {
      if (error.name !== "AbortError")
        shareStatus.textContent =
          "Could not share automatically. You can copy this page’s address from your browser.";
    }
  });
}
