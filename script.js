/* Maa Tara Solutions Ltd — interactions.
   Everything degrades to plain readable content if JS is unavailable. */

(function () {
  "use strict";

  var year = document.getElementById("current-year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  /* ---------- contact address, read from the markup so the HTML stays
     the single source of truth for the business details ---------- */

  function readEmail() {
    var link = document.querySelector('a[href^="mailto:"]');
    if (!link) return "";
    return link.getAttribute("href").replace("mailto:", "").split("?")[0];
  }

  /* ---------- mobile menu ---------- */

  var toggle = document.querySelector(".menu-toggle");
  var nav = document.getElementById("primary-nav");

  function closeMenu() {
    if (!toggle || !nav) return;
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeMenu();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });
  }

  /* ---------- nav highlighting ---------- */

  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('#primary-nav a[href^="#"]')
  );
  var watched = navLinks
    .map(function (link) {
      return document.querySelector(link.getAttribute("href"));
    })
    .filter(Boolean);

  if (watched.length && "IntersectionObserver" in window) {
    var setCurrent = function (id) {
      navLinks.forEach(function (link) {
        link.classList.toggle(
          "is-current",
          link.getAttribute("href") === "#" + id
        );
      });
    };

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) setCurrent(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
    );

    watched.forEach(function (section) {
      observer.observe(section);
    });
  }

  /* ---------- tab groups (job stages, vehicle options) ---------- */

  function initTabs(listSelector, onSelect) {
    var list = document.querySelector(listSelector);
    if (!list) return null;

    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return null;

    function select(index, moveFocus) {
      tabs.forEach(function (tab, i) {
        var active = i === index;
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
        var panel = document.getElementById(tab.getAttribute("aria-controls"));
        if (panel) panel.hidden = !active;
      });
      if (moveFocus) tabs[index].focus();
      if (onSelect) onSelect(index, tabs[index]);
    }

    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () {
        select(index, false);
      });

      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          next = (index + 1) % tabs.length;
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          next = (index - 1 + tabs.length) % tabs.length;
        } else if (event.key === "Home") {
          next = 0;
        } else if (event.key === "End") {
          next = tabs.length - 1;
        }
        if (next !== null) {
          event.preventDefault();
          select(next, true);
        }
      });
    });

    var initial = tabs.findIndex(function (tab) {
      return tab.getAttribute("aria-selected") === "true";
    });
    select(initial === -1 ? 0 : initial, false);

    return {
      tabs: tabs,
      select: select,
      current: function () {
        return tabs.find(function (tab) {
          return tab.getAttribute("aria-selected") === "true";
        });
      }
    };
  }

  var marker = document.querySelector("[data-run-marker]");

  initTabs(".run-stages", function (index, tab) {
    if (!marker) return;
    var total = tab.parentElement.children.length;
    marker.style.setProperty(
      "--marker-pos",
      ((index + 0.5) / total) * 100 + "%"
    );
  });

  var fleet = initTabs(".fleet-strip");

  /* ---------- job planner ---------- */

  var planner = document.getElementById("planner");

  if (planner) {
    planner.addEventListener("submit", function (event) {
      event.preventDefault();
    });

    var sheetFields = {
      service: planner.querySelector('[data-sheet="service"]'),
      vehicle: planner.querySelector('[data-sheet="vehicle"]'),
      distance: planner.querySelector('[data-sheet="distance"]')
    };
    var sheetNote = planner.querySelector('[data-sheet="note"]');
    var emailLink = document.getElementById("email-job");
    var copySheetButton = planner.querySelector("[data-copy-sheet]");
    var plannerStatus = planner.querySelector(".console-status");

    function currentValue(name) {
      var picked = planner.querySelector('input[name="' + name + '"]:checked');
      return picked ? picked.value : "";
    }

    function noteFor(service, vehicle) {
      if (service === "Transport coordination") {
        return "We will look at what the movement needs and coordinate the transport, including sourcing a subcontracted operator where that is the right fit.";
      }
      if (vehicle === "To be advised") {
        return "Tell us what the load is and we will match a vehicle to it, using our own, hired or subcontracted capacity.";
      }
      if (service === "Same-day delivery") {
        return "Same-day work depends on the capacity available when you call, so the sooner we know, the better the answer.";
      }
      return "We will confirm the vehicle and timing we can cover before anything is booked.";
    }

    function sheetText() {
      var service = currentValue("service");
      var vehicle = currentValue("vehicle");
      var distance = currentValue("distance");
      return [
        "Job enquiry — Maa Tara Solutions Ltd",
        "",
        "Service: " + service,
        "Vehicle: " + vehicle,
        "Distance: " + distance,
        "",
        "Collection postcode: ",
        "Delivery postcode: ",
        "What is the load: ",
        "Needed by: ",
        "",
        "Name: ",
        "Best number: "
      ].join("\n");
    }

    function updateSheet() {
      var service = currentValue("service");
      var vehicle = currentValue("vehicle");
      var distance = currentValue("distance");

      if (sheetFields.service) sheetFields.service.textContent = service;
      if (sheetFields.vehicle) sheetFields.vehicle.textContent = vehicle;
      if (sheetFields.distance) sheetFields.distance.textContent = distance;
      if (sheetNote) sheetNote.textContent = noteFor(service, vehicle);

      if (emailLink) {
        var address = readEmail();
        emailLink.setAttribute(
          "href",
          "mailto:" +
            address +
            "?subject=" +
            encodeURIComponent(service + " enquiry — " + distance) +
            "&body=" +
            encodeURIComponent(sheetText())
        );
      }
    }

    planner.addEventListener("change", function (event) {
      if (event.target.matches('input[type="radio"]')) {
        updateSheet();
        if (plannerStatus) plannerStatus.textContent = "";
        if (event.target.name === "vehicle" && fleet) {
          var match = fleet.tabs.findIndex(function (tab) {
            return tab.getAttribute("data-vehicle") === event.target.id;
          });
          if (match !== -1) fleet.select(match, false);
        }
      }
    });

    updateSheet();

    /* ---------- clipboard ---------- */

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise(function (resolve, reject) {
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        var ok = false;
        try {
          ok = document.execCommand("copy");
        } catch (error) {
          ok = false;
        }
        document.body.removeChild(area);
        ok ? resolve() : reject(new Error("copy failed"));
      });
    }

    if (copySheetButton) {
      copySheetButton.addEventListener("click", function () {
        copyText(sheetText()).then(
          function () {
            if (plannerStatus) {
              plannerStatus.textContent = "Job sheet copied to your clipboard.";
            }
          },
          function () {
            if (plannerStatus) {
              plannerStatus.textContent =
                "Copying is blocked in this browser. Use Email this job sheet instead.";
            }
          }
        );
      });
    }

    /* ---------- vehicle section feeds the planner ---------- */

    var useVehicle = document.querySelector("[data-use-vehicle]");
    var fleetStatus = document.querySelector(".fleet-status");

    if (useVehicle && fleet) {
      useVehicle.addEventListener("click", function () {
        var tab = fleet.current();
        if (!tab) return;
        var radio = document.getElementById(tab.getAttribute("data-vehicle"));
        if (!radio) return;
        radio.checked = true;
        updateSheet();
        if (fleetStatus) {
          fleetStatus.textContent =
            "Job sheet updated: " + radio.value + ". It is ready at the top of the page.";
        }
      });
    }

    /* ---------- contact copy buttons ---------- */

    var copyStatus = document.querySelector(".band-contact .copy-status");

    Array.prototype.forEach.call(
      document.querySelectorAll("[data-copy]"),
      function (button) {
        button.addEventListener("click", function () {
          var value = button.getAttribute("data-copy");
          copyText(value).then(
            function () {
              button.classList.add("is-copied");
              button.textContent = "Copied";
              if (copyStatus) copyStatus.textContent = "Copied " + value;
              window.setTimeout(function () {
                button.classList.remove("is-copied");
                button.textContent = "Copy";
              }, 2000);
            },
            function () {
              if (copyStatus) {
                copyStatus.textContent =
                  "Copying is blocked in this browser. Select the text instead.";
              }
            }
          );
        });
      }
    );
  }
})();
