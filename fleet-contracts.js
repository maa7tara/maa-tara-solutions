/* Maa Tara Solutions Ltd — business contract enquiry wizard.
   Runs entirely in the browser. On send it opens the visitor's email app
   with the enquiry filled in, the same mailto: route the homepage planner
   uses, and copies the text to the clipboard as a backup. */

(function () {
  "use strict";

  var form = document.getElementById("fleet-form");
  if (!form) return;

  /* ---------- typical UK van capacities, used only for the estimate ----------
     Deliberately conservative planning figures for each size class, not a
     specification of any particular vehicle. Edit here if they need tuning. */

  var VANS = [
    { field: "qtySmall", name: "Small van", m3: 3.3, kg: 600, uk: 1, euro: 2 },
    { field: "qtyMedium", name: "Medium van", m3: 6, kg: 1000, uk: 2, euro: 3 },
    { field: "qtyLwb", name: "LWB van", m3: 11, kg: 1200, uk: 3, euro: 4 },
    { field: "qtyXlwb", name: "XLWB van", m3: 14, kg: 1100, uk: 4, euro: 5 },
    { field: "qtyLuton", name: "Luton van", m3: 19, kg: 1000, uk: 5, euro: 6 }
  ];

  /* Loads rarely cube out perfectly, so plan on 85% of the load space. */
  var CUBE_FILL = 0.85;

  var steps = Array.prototype.slice.call(form.querySelectorAll(".fc-step"));
  var progress = Array.prototype.slice.call(form.querySelectorAll("[data-progress]"));
  var errorBox = form.querySelector(".fc-errors");
  var prevButton = form.querySelector("[data-prev]");
  var nextButton = form.querySelector("[data-next]");
  var sendButton = form.querySelector("[data-send]");
  var copyButton = form.querySelector("[data-copy-enquiry]");
  var sendStatus = form.querySelector("[data-send-status]");
  var estimateOutput = form.querySelector("[data-estimate-output]");
  var qtyTotal = form.querySelector("[data-qty-total]");
  var reviewBox = form.querySelector("[data-review]");
  var current = 0;
  var suggestion = null;
  var estimateHtml = "";

  /* ---------- helpers ---------- */

  function readEmail() {
    var link = document.querySelector('a[href^="mailto:"]');
    if (!link) return "";
    return link.getAttribute("href").replace("mailto:", "").split("?")[0];
  }

  function field(name) {
    return form.elements[name];
  }

  function value(name) {
    var el = field(name);
    if (!el) return "";
    if (!el.tagName) {
      var picked = form.querySelector('[name="' + name + '"]:checked');
      return picked ? picked.value : "";
    }
    if (el.type === "checkbox") return el.checked ? el.value : "";
    return String(el.value || "").trim();
  }

  function values(name) {
    return Array.prototype.map.call(
      form.querySelectorAll('[name="' + name + '"]:checked'),
      function (box) {
        return box.value;
      }
    );
  }

  function number(name) {
    var n = parseFloat(value(name));
    return isFinite(n) && n > 0 ? n : 0;
  }

  /* A field counts only if no conditional wrapper around it is hidden. */
  function isShown(el) {
    var node = el;
    while (node && node !== form) {
      if (node.hasAttribute && node.hasAttribute("data-show-when") && node.hidden) {
        return false;
      }
      node = node.parentNode;
    }
    return true;
  }

  function shownValue(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el && isShown(el) ? value(name) : "";
  }

  function formatDate(iso) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!parts) return "";
    var date = new Date(+parts[1], +parts[2] - 1, +parts[3]);
    return date.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function todayIso() {
    var now = new Date();
    var pad = function (n) {
      return (n < 10 ? "0" : "") + n;
    };
    return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  }

  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  /* ---------- UK formats ---------- */

  /* The +44 sits in front of the phone box, so visitors type the national
     number. Anything they paste with +44, 0044 or a leading 0 still works. */
  function phoneDigits(raw) {
    var s = String(raw).replace(/[^\d+]/g, "");
    if (/^\+44/.test(s)) s = s.slice(3);
    else if (/^0044/.test(s)) s = s.slice(4);
    else if (/^\+/.test(s)) return null;
    return s.replace(/^0/, "");
  }

  function phoneKind(n) {
    if (/^7[1-9]\d{8}$/.test(n)) return "mobile";
    if (/^[12]\d{8,9}$/.test(n)) return "landline";
    if (/^3\d{9}$/.test(n)) return "03 business number";
    if (/^80[08]\d{6,7}$/.test(n)) return "freephone number";
    return "";
  }

  function normalisePhone(raw) {
    var n = phoneDigits(raw);
    return n && phoneKind(n) ? n : "";
  }

  function formatPhone(n) {
    if (/^2/.test(n)) return n.slice(0, 2) + " " + n.slice(2, 6) + " " + n.slice(6);
    if (/^[38]/.test(n)) return n.slice(0, 3) + " " + n.slice(3, 6) + " " + n.slice(6);
    return n.slice(0, 4) + " " + n.slice(4);
  }

  function normalisePostcode(raw) {
    var compact = String(raw).toUpperCase().replace(/\s+/g, "");
    if (compact === "GIR0AA") return "GIR 0AA";
    if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) return "";
    return compact.slice(0, -3) + " " + compact.slice(-3);
  }

  function normaliseCompanyNumber(raw) {
    var compact = String(raw).toUpperCase().replace(/\s+/g, "");
    if (/^\d{1,8}$/.test(compact)) compact = ("00000000" + compact).slice(-8);
    return /^(\d{8}|[A-Z]{2}\d{6})$/.test(compact) ? compact : "";
  }

  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* Common mistyped email domains. A gentle "did you mean", never a block. */
  var COMMON_DOMAINS = [
    "gmail.com", "googlemail.com", "hotmail.com", "hotmail.co.uk", "outlook.com",
    "live.co.uk", "yahoo.com", "yahoo.co.uk", "icloud.com", "btinternet.com",
    "aol.com", "sky.com", "virginmedia.com"
  ];

  function editDistance(a, b) {
    var row = [];
    for (var j = 0; j <= b.length; j++) row[j] = j;
    for (var i = 1; i <= a.length; i++) {
      var prev = row[0];
      row[0] = i;
      for (j = 1; j <= b.length; j++) {
        var keep = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = keep;
      }
    }
    return row[b.length];
  }

  function emailSuggestion(email) {
    var at = email.lastIndexOf("@");
    if (at < 1) return "";
    var domain = email.slice(at + 1).toLowerCase();
    var fixed = domain
      .replace(/\.(con|cmo|cm|ocm)$/, ".com")
      .replace(/\.(co\.k|couk|co\.ukk|uk\.co)$/, ".co.uk");
    if (COMMON_DOMAINS.indexOf(fixed) === -1 && fixed.length >= 5) {
      COMMON_DOMAINS.some(function (known) {
        if (editDistance(fixed, known) <= 2) {
          fixed = known;
          return true;
        }
        return false;
      });
    }
    return fixed !== domain ? email.slice(0, at + 1) + fixed : "";
  }

  /* ---------- live feedback under phone, email and postcode ---------- */

  function setLive(name, state, text) {
    var live = form.querySelector('[data-live="' + name + '"]');
    if (!live) return null;
    if (!live.hasAttribute("data-default")) {
      live.setAttribute("data-default", live.textContent.trim());
    }
    live.classList.toggle("is-ok", state === "ok");
    live.classList.toggle("is-problem", state === "problem");
    live.textContent = state === "default" ? live.getAttribute("data-default") : text;
    return live;
  }

  function checkPhone(onLeave) {
    var raw = value("phone");
    var n = phoneDigits(raw);
    if (!raw) return setLive("phone", "default");
    if (n === null) return setLive("phone", "problem", "This form takes UK numbers only.");
    var kind = phoneKind(n);
    if (kind) return setLive("phone", "ok", "Looks right: UK " + kind + ", +44 " + formatPhone(n));
    if (onLeave || n.length >= 10) {
      return setLive("phone", "problem", "That does not look like a UK number. Mobiles start with 7 and have 10 digits after the +44.");
    }
    setLive("phone", "default");
  }

  function checkEmail() {
    var email = value("email");
    if (!email) return setLive("email", "default");
    if (!EMAIL_PATTERN.test(email)) {
      return setLive("email", "problem", "Check the address. It should look like name@company.co.uk");
    }
    var better = emailSuggestion(email);
    if (!better) return setLive("email", "ok", "Looks right.");
    var live = setLive("email", "problem", "Did you mean " + better + "? ");
    var fix = document.createElement("button");
    fix.type = "button";
    fix.className = "fc-edit";
    fix.textContent = "Use this";
    fix.addEventListener("click", function () {
      field("email").value = better;
      checkEmail();
      field("email").focus();
    });
    live.appendChild(fix);
  }

  /* Postcodes are checked against postcodes.io, a free public lookup built on
     Office for National Statistics data. If it cannot be reached the form
     carries on with the format check alone. */
  var lookups = {};
  var fillingRegion = false;

  function lookupPostcode(postcode) {
    if (lookups[postcode]) return lookups[postcode].promise;
    var entry = { status: "pending", result: null };
    entry.promise = fetch("https://api.postcodes.io/postcodes/" + encodeURIComponent(postcode.replace(" ", "")))
      .then(function (response) {
        if (response.status === 404) return { status: "missing" };
        if (!response.ok) return { status: "error" };
        return response.json().then(function (data) {
          return { status: "ok", result: data.result };
        });
      })
      .catch(function () {
        return { status: "error" };
      })
      .then(function (outcome) {
        entry.status = outcome.status;
        entry.result = outcome.result || null;
        if (entry.status === "error") delete lookups[postcode];
        return entry;
      });
    lookups[postcode] = entry;
    return entry.promise;
  }

  function regionFor(result) {
    return result.country === "England" ? result.region : result.country;
  }

  function fillRegion(name) {
    var select = field("region");
    if (!select || !name) return;
    if (select.value && !select.hasAttribute("data-auto")) return;
    var match = Array.prototype.find.call(select.options, function (option) {
      return option.text.toLowerCase() === name.toLowerCase();
    });
    if (!match) return;
    select.value = match.value;
    select.setAttribute("data-auto", "");
    fillingRegion = true;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    fillingRegion = false;
  }

  function checkPostcode(input, onLeave) {
    var raw = input.value.trim();
    if (!raw) return setLive(input.name, "default");
    var postcode = normalisePostcode(raw);
    if (!postcode) {
      if (onLeave) setLive(input.name, "problem", "Enter a full UK postcode, like NR1 1AA");
      else setLive(input.name, "default");
      return;
    }
    if (!lookups[postcode] || lookups[postcode].status === "pending") {
      setLive(input.name, "checking", "Checking postcode…");
    }
    lookupPostcode(postcode).then(function (entry) {
      if (normalisePostcode(input.value) !== postcode) return;
      if (entry.status === "ok") {
        var place = [entry.result.admin_district, regionFor(entry.result)].filter(Boolean).join(", ");
        setLive(input.name, "ok", "Found: " + place);
        if (input.hasAttribute("data-fills-region")) fillRegion(regionFor(entry.result));
      } else if (entry.status === "missing") {
        setLive(input.name, "problem", "We cannot find this postcode. Please check it.");
      } else {
        setLive(input.name, "checking", "We could not check this postcode just now, but you can carry on.");
      }
    });
  }

  var postcodeTimer = null;

  form.addEventListener("input", function (event) {
    var el = event.target;
    if (el.name === "phone") checkPhone(false);
    else if (el.name === "email") setLive("email", "default");
    else if (el.getAttribute("data-validate") === "postcode") {
      window.clearTimeout(postcodeTimer);
      postcodeTimer = window.setTimeout(function () {
        checkPostcode(el, false);
      }, 450);
    }
  });

  form.addEventListener("change", function (event) {
    if (event.target.name === "region" && !fillingRegion) {
      event.target.removeAttribute("data-auto");
    }
  });

  /* Tidy formats and check values as the visitor leaves each field. */
  form.addEventListener(
    "blur",
    function (event) {
      var el = event.target;
      if (el.name === "phone") {
        var phone = normalisePhone(el.value);
        if (phone) el.value = formatPhone(phone);
        checkPhone(true);
      } else if (el.name === "email") {
        checkEmail();
      } else if (el.getAttribute && el.getAttribute("data-validate") === "postcode") {
        var postcode = normalisePostcode(el.value);
        if (postcode) el.value = postcode;
        window.clearTimeout(postcodeTimer);
        checkPostcode(el, true);
      } else if (el.name === "companyNumber" && el.value) {
        var crn = normaliseCompanyNumber(el.value);
        if (crn) el.value = crn;
      }
    },
    true
  );

  /* ---------- progressive disclosure ---------- */

  var conditionals = Array.prototype.slice.call(form.querySelectorAll("[data-show-when]"));

  function updateConditionals() {
    conditionals.forEach(function (el) {
      var rule = el.getAttribute("data-show-when").split(":");
      var name = rule[0];
      var wanted = rule.slice(1).join(":").split("|");
      var control = form.querySelector('[name="' + name + '"]');
      var actual;
      if (control && (control.type === "checkbox" || control.type === "radio")) {
        actual = values(name);
      } else {
        actual = [value(name)];
      }
      el.hidden = !actual.some(function (v) {
        return wanted.indexOf(v) !== -1;
      });
    });
  }

  /* ---------- vehicle steppers ---------- */

  function qtyOf(name) {
    var n = parseInt(value(name), 10);
    return isFinite(n) && n > 0 ? Math.min(n, 99) : 0;
  }

  function knownVehicles() {
    return Array.prototype.map
      .call(form.querySelectorAll("[data-vehicle]"), function (input) {
        return { name: input.getAttribute("data-vehicle"), qty: qtyOf(input.name) };
      })
      .filter(function (row) {
        return row.qty > 0;
      });
  }

  function updateQtyTotal() {
    var total = knownVehicles().reduce(function (sum, row) {
      return sum + row.qty;
    }, 0);
    if (qtyTotal) qtyTotal.textContent = plural(total, "vehicle") + " a day";
  }

  form.addEventListener("click", function (event) {
    var stepper = event.target.closest("[data-step-by]");
    if (!stepper) return;
    var input = stepper.parentNode.querySelector("input");
    var next = qtyOf(input.name) + parseInt(stepper.getAttribute("data-step-by"), 10);
    input.value = String(Math.max(0, Math.min(99, next)));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  /* ---------- fleet estimate ---------- */

  function volumeInputs() {
    var weight = number("volWeight");
    if (value("volWeightUnit") === "t") weight *= 1000;
    return {
      pallets: number("volPallets"),
      palletType: value("volPalletType"),
      kg: weight,
      m3: number("volCube"),
      days: Math.max(1, Math.min(31, number("volDays") || 22)),
      trips: Math.max(1, number("volTrips") || 1),
      peak: parseFloat(value("volPeak")) || 0
    };
  }

  function estimate() {
    var input = volumeInputs();
    if (!input.pallets && !input.kg && !input.m3) return null;

    var perDay = function (monthly) {
      return (monthly * (1 + input.peak)) / input.days;
    };
    var daily = { pallets: perDay(input.pallets), kg: perDay(input.kg), m3: perDay(input.m3) };

    var rows = VANS.map(function (van) {
      var perLoad = {
        pallets: input.palletType === "euro" ? van.euro : van.uk,
        kg: van.kg,
        m3: van.m3 * CUBE_FILL
      };
      var need = { pallets: 0, kg: 0, m3: 0 };
      Object.keys(need).forEach(function (key) {
        if (daily[key]) need[key] = Math.ceil(daily[key] / (perLoad[key] * input.trips) - 1e-9);
      });
      var count = Math.max(need.pallets, need.kg, need.m3, 1);
      var limit = need.kg === count && daily.kg ? "weight" : need.pallets === count && daily.pallets ? "pallets" : "space";
      return { van: van, count: count, limit: limit };
    });

    /* Fewest vehicles wins; on a tie the smaller van is cheaper to run. */
    var best = rows.reduce(function (a, b) {
      return b.count < a.count ? b : a;
    });

    return { rows: rows, best: best, daily: daily, input: input };
  }

  function renderEstimate() {
    if (!estimateOutput) return;
    suggestion = estimate();
    if (!suggestion) {
      paintEstimate('<p class="fc-hint">Enter pallets, weight or cubic metres to see a suggestion.</p>');
      return;
    }

    var d = suggestion.daily;
    var load = [];
    if (d.pallets) load.push(Math.round(d.pallets * 10) / 10 + " pallets");
    if (d.kg) load.push(Math.round(d.kg).toLocaleString("en-GB") + " kg");
    if (d.m3) load.push(Math.round(d.m3 * 10) / 10 + " m³");

    var html =
      '<p class="fc-estimate-lede">About <strong>' +
      load.join(", ") +
      "</strong> on a busy day" +
      (suggestion.input.peak ? ", allowing for your peak" : "") +
      ".</p><table class=\"fc-estimate-table\"><thead><tr><th scope=\"col\">If you used only</th>" +
      '<th scope="col">Vans a day</th><th scope="col">Limited by</th></tr></thead><tbody>';
    suggestion.rows.forEach(function (row) {
      var isBest = row === suggestion.best;
      html +=
        "<tr" +
        (isBest ? ' class="is-best"' : "") +
        '><th scope="row">' +
        row.van.name +
        (isBest ? ' <span class="fc-badge">Suggested</span>' : "") +
        "</th><td>" +
        row.count +
        "</td><td>" +
        row.limit +
        "</td></tr>";
    });
    html +=
      "</tbody></table>" +
      '<button class="btn btn-quiet" type="button" data-use-suggestion>Use ' +
      plural(suggestion.best.count, suggestion.best.van.name) +
      " a day</button>" +
      '<p class="fc-hint">A guide based on typical UK van sizes, not a quote. We will check it against your actual loads, and you are free to ignore it.</p>';
    paintEstimate(html);
  }

  /* Repaint only on a real change, so a change event fired as a field loses
     focus cannot swap out the suggestion button mid-click. */
  function paintEstimate(html) {
    if (html === estimateHtml) return;
    estimateHtml = html;
    estimateOutput.innerHTML = html;
  }

  form.addEventListener("click", function (event) {
    if (!event.target.closest("[data-use-suggestion]") || !suggestion) return;
    Array.prototype.forEach.call(form.querySelectorAll("[data-vehicle]"), function (input) {
      input.value = input.name === suggestion.best.van.field ? String(suggestion.best.count) : "0";
    });
    document.getElementById("mode-known").checked = true;
    refresh();
    var target = document.getElementById("qty-" + suggestion.best.van.field.slice(3).toLowerCase());
    if (target) target.focus();
    if (qtyTotal) {
      qtyTotal.textContent =
        "Suggestion added: " + plural(suggestion.best.count, suggestion.best.van.name) +
        " a day. Adjust it if you like.";
    }
  });

  /* ---------- collecting the answers ---------- */

  function demandRows() {
    var rows = [];
    var mode = value("demandMode");
    var vehicles = knownVehicles();
    var input = volumeInputs();
    var hasVolume = input.pallets || input.kg || input.m3;

    if (mode === "known" && vehicles.length) {
      vehicles.forEach(function (row) {
        rows.push([row.name, row.qty + " a day"]);
      });
    }
    if (mode === "volume" || (hasVolume && vehicles.length)) {
      if (input.pallets) {
        var type = { uk: "UK standard", euro: "Euro", mixed: "mixed sizes" }[input.palletType];
        rows.push(["Pallets per month", input.pallets + " (" + type + ")"]);
      }
      if (input.kg) rows.push(["Weight per month", input.kg.toLocaleString("en-GB") + " kg"]);
      if (input.m3) rows.push(["Cubic volume per month", input.m3 + " m³"]);
      if (hasVolume) {
        rows.push(["Working days per month", String(input.days)]);
        rows.push(["Loads per vehicle per day", String(input.trips)]);
        if (input.peak) rows.push(["Peak uplift", "Up to " + Math.round(input.peak * 100) + "%"]);
        var est = estimate();
        if (est && mode === "volume") {
          rows.push(["Form suggestion", plural(est.best.count, est.best.van.name) + " a day"]);
        }
      }
    }
    if (value("goods")) rows.push(["Goods", value("goods")]);
    return rows;
  }

  function scheduleRows() {
    var rows = [["Pattern", value("pattern")]];
    if (shownValue("every")) {
      rows.push(["Days", values("days").join(", ") + " — " + value("every").toLowerCase()]);
    }
    if (shownValue("vehicleDays")) rows.push(["Vehicle-days per month", value("vehicleDays")]);
    if (shownValue("fixedDates")) rows.push(["Fixed dates", value("fixedDates")]);
    rows.push(["Usual start time", value("shift")]);
    rows.push(["Contract length", value("duration")]);
    rows.push(["Estimated start", formatDate(value("startDate"))]);
    if (value("currentCover")) rows.push(["Covered today by", value("currentCover")]);
    if (value("bankHolidays")) rows.push(["Bank holidays", "Cover needed"]);
    return rows;
  }

  function operationsRows() {
    var rows = [["Route type", value("route")]];
    if (shownValue("drops")) rows.push(["Drops per vehicle per day", value("drops")]);
    rows.push(["Daily mileage", value("miles")]);
    rows.push(["Operating area", value("area")]);
    if (value("basePostcode")) rows.push(["Collection postcode", value("basePostcode")]);
    if (values("crew").length) rows.push(["Driver requirements", values("crew").join(", ")]);
    var needs = values("needs");
    rows.push(["Equipment and compliance", needs.length ? needs.join(", ") : "None specified"]);
    if (shownValue("cazList")) rows.push(["Clean Air Zones", value("cazList")]);
    if (shownValue("tempRange")) rows.push(["Temperature range", value("tempRange")]);
    if (shownValue("adrDetail")) rows.push(["Dangerous goods", value("adrDetail")]);
    rows.push(["Value per load", value("loadValue")]);
    if (value("access")) rows.push(["Site access", value("access")]);
    return rows;
  }

  function sections() {
    var sector = value("sector") === "Other" ? value("sectorOther") : value("sector");
    var business = [
      ["Company", value("company")],
      ["Companies House no.", value("companyNumber")],
      ["Sector", sector],
      ["Contact", value("contactName") + (value("jobTitle") ? ", " + value("jobTitle") : "")],
      ["Email", value("email")],
      ["Phone", normalisePhone(value("phone")) ? "+44 " + formatPhone(normalisePhone(value("phone"))) : value("phone")],
      ["Postcode", value("postcode")],
      ["Region", value("region")],
      ["Best contact", value("contactPref")]
    ];
    return [
      { step: 0, title: "Business", rows: business },
      { step: 1, title: "Demand", rows: demandRows() },
      { step: 2, title: "Schedule and contract", rows: scheduleRows() },
      { step: 3, title: "Operations", rows: operationsRows() }
    ].map(function (section) {
      section.rows = section.rows.filter(function (row) {
        return row[1];
      });
      return section;
    });
  }

  function enquiryText() {
    var lines = ["Business contract enquiry — Maa Tara Solutions Ltd", ""];
    sections().forEach(function (section) {
      lines.push(section.title.toUpperCase());
      section.rows.forEach(function (row) {
        lines.push(row[0] + ": " + row[1]);
      });
      lines.push("");
    });
    if (value("notes")) lines.push("NOTES", value("notes"), "");
    lines.push("Consent to be contacted about this enquiry: " + (value("consent") ? "Yes" : "No"));
    lines.push("Happy to receive updates: " + (value("marketing") ? "Yes" : "No"));
    return lines.join("\n");
  }

  function subject() {
    var count = value("demandMode") !== "known" ? 0 : knownVehicles().reduce(function (sum, row) {
      return sum + row.qty;
    }, 0);
    var size = count ? plural(count, "vehicle") + " a day" : "fleet to be sized";
    return "Business contract enquiry — " + (value("company") || "new client") + " — " + size;
  }

  /* ---------- review step ---------- */

  function renderReview() {
    if (!reviewBox) return;
    reviewBox.textContent = "";
    sections().forEach(function (section) {
      var block = document.createElement("section");
      block.className = "fc-review-block";

      var head = document.createElement("div");
      head.className = "fc-review-head";
      var title = document.createElement("h3");
      title.textContent = section.title;
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "fc-edit";
      edit.textContent = "Change";
      edit.setAttribute("aria-label", "Change " + section.title.toLowerCase());
      edit.addEventListener("click", function () {
        goTo(section.step);
      });
      head.appendChild(title);
      head.appendChild(edit);
      block.appendChild(head);

      var list = document.createElement("dl");
      section.rows.forEach(function (row) {
        var item = document.createElement("div");
        item.className = "jobsheet-row";
        var dt = document.createElement("dt");
        dt.textContent = row[0];
        var dd = document.createElement("dd");
        dd.textContent = row[1];
        item.appendChild(dt);
        item.appendChild(dd);
        list.appendChild(item);
      });
      block.appendChild(list);
      reviewBox.appendChild(block);
    });
  }

  /* ---------- live summary panel ---------- */

  function setSide(key, text) {
    var el = document.querySelector('[data-side="' + key + '"]');
    if (el) el.textContent = text || "—";
  }

  function updateSide() {
    setSide("company", value("company"));
    var vehicles = knownVehicles();
    var est = value("demandMode") === "volume" ? estimate() : null;
    setSide(
      "vehicles",
      vehicles.length && value("demandMode") === "known"
        ? vehicles
            .map(function (row) {
              return row.qty + " × " + row.name;
            })
            .join(", ")
        : est
        ? "To size — about " + plural(est.best.count, est.best.van.name)
        : ""
    );
    var pattern = value("pattern");
    if (pattern === "Set days each week" && values("days").length) {
      pattern = values("days").join(", ");
    }
    setSide("pattern", pattern);
    setSide("duration", value("duration"));
    setSide("start", formatDate(value("startDate")));
    setSide("route", value("route"));
  }

  /* ---------- validation ---------- */

  var MESSAGES = {
    company: "Enter your company name",
    sector: "Choose your industry sector",
    sectorOther: "Tell us your sector",
    contactName: "Enter a contact name",
    email: "Enter a business email address, like name@company.co.uk",
    phone: "Enter a UK phone number after the +44, like 7123 456789 or 1603 123456",
    postcodeMissing: "We cannot find this postcode. Please check it",
    postcode: "Enter a full UK postcode, like NR1 1AA",
    basePostcode: "Enter a full UK postcode, or leave this blank",
    companyNumber: "Companies House numbers are 8 characters, like 01234567 or SC123456",
    region: "Choose your region",
    vehicleDays: "Enter how many vehicle-days you need each month",
    duration: "Choose a contract length",
    startDate: "Choose a start date from today onwards",
    consent: "Tick the box to let us use your details to reply"
  };

  function clearErrors(step) {
    Array.prototype.forEach.call(step.querySelectorAll(".fc-error"), function (el) {
      el.parentNode.removeChild(el);
    });
    Array.prototype.forEach.call(step.querySelectorAll("[aria-invalid]"), function (el) {
      el.removeAttribute("aria-invalid");
      var base = el.getAttribute("data-base-describedby");
      if (base) el.setAttribute("aria-describedby", base);
      else el.removeAttribute("aria-describedby");
    });
    errorBox.hidden = true;
    errorBox.textContent = "";
  }

  function flag(el, message, problems) {
    var id = "err-" + (el.id || el.name);
    var note = document.createElement("p");
    note.className = "fc-error";
    note.id = id;
    note.textContent = message;
    var host = el.closest(".fc-field, .fc-check, .fc-panel, .console-field") || el.parentNode;
    if (el.closest(".fc-field, .fc-check")) {
      el.setAttribute("aria-invalid", "true");
      var base = el.getAttribute("data-base-describedby");
      if (base === null) {
        base = el.getAttribute("aria-describedby") || "";
        el.setAttribute("data-base-describedby", base);
      }
      el.setAttribute("aria-describedby", (base + " " + id).trim());
    }
    host.appendChild(note);
    problems.push({ el: el, message: message });
  }

  function validateStep(index) {
    var step = steps[index];
    var problems = [];
    clearErrors(step);

    Array.prototype.forEach.call(step.querySelectorAll("input, select, textarea"), function (el) {
      if (!isShown(el) || !el.name) return;
      var v = el.type === "checkbox" ? (el.checked ? "on" : "") : String(el.value).trim();
      var rule = el.getAttribute("data-validate");

      if (el.required && !v) {
        flag(el, MESSAGES[el.name] || "This field is needed", problems);
      } else if (el.type === "email" && v && !EMAIL_PATTERN.test(v)) {
        flag(el, MESSAGES.email, problems);
      } else if (rule === "phone" && v && !normalisePhone(v)) {
        flag(el, MESSAGES.phone, problems);
      } else if (rule === "postcode" && v && !normalisePostcode(v)) {
        flag(el, MESSAGES[el.name] || MESSAGES.postcode, problems);
      } else if (rule === "postcode" && v && (lookups[normalisePostcode(v)] || {}).status === "missing") {
        flag(el, MESSAGES.postcodeMissing, problems);
      } else if (el.name === "companyNumber" && v && !normaliseCompanyNumber(v)) {
        flag(el, MESSAGES.companyNumber, problems);
      } else if (el.name === "startDate" && v && v < todayIso()) {
        flag(el, MESSAGES.startDate, problems);
      }
    });

    if (index === 1) {
      var mode = value("demandMode");
      var input = volumeInputs();
      if (mode === "known" && !knownVehicles().length) {
        flag(document.getElementById("qty-small"), "Add at least one vehicle, or choose Work it out from my volumes", problems);
      } else if (mode === "volume" && !input.pallets && !input.kg && !input.m3) {
        flag(document.getElementById("vol-pallets"), "Enter pallets, weight or cubic metres per month", problems);
      }
    }

    Array.prototype.forEach.call(step.querySelectorAll("[data-required-group]"), function (group) {
      if (!isShown(group)) return;
      var name = group.getAttribute("data-required-group");
      if (!values(name).length) {
        flag(group.querySelector("input"), "Choose at least one day", problems);
      }
    });

    if (problems.length) {
      var title = document.createElement("p");
      title.className = "fc-errors-title";
      title.textContent = problems.length === 1 ? "There is 1 thing to fix" : "There are " + problems.length + " things to fix";
      var list = document.createElement("ul");
      problems.forEach(function (problem) {
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.href = "#" + problem.el.id;
        link.textContent = problem.message;
        link.addEventListener("click", function (event) {
          event.preventDefault();
          problem.el.focus();
        });
        item.appendChild(link);
        list.appendChild(item);
      });
      errorBox.appendChild(title);
      errorBox.appendChild(list);
      errorBox.hidden = false;
      errorBox.focus();
      return false;
    }
    return true;
  }

  /* ---------- step navigation ---------- */

  function goTo(index) {
    current = Math.max(0, Math.min(steps.length - 1, index));
    steps.forEach(function (step, i) {
      step.hidden = i !== current;
    });
    progress.forEach(function (item, i) {
      item.classList.toggle("is-done", i < current);
      if (i === current) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    prevButton.hidden = current === 0;
    nextButton.hidden = current === steps.length - 1;
    errorBox.hidden = true;
    if (current === steps.length - 1) renderReview();
    if (sendStatus) sendStatus.textContent = "";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    steps[current].focus({ preventScroll: true });
  }

  steps.forEach(function (step) {
    step.tabIndex = -1;
  });

  /* Wait briefly for any postcode lookups on this step, so a mistyped
     postcode is caught before moving on. A slow lookup never blocks. */
  function pendingLookups(step) {
    var waits = Array.prototype.map.call(step.querySelectorAll('[data-validate="postcode"]'), function (el) {
      var postcode = normalisePostcode(el.value);
      return postcode && isShown(el) ? lookupPostcode(postcode) : null;
    }).filter(Boolean);
    if (!waits.length) return Promise.resolve();
    return Promise.race([
      Promise.all(waits),
      new Promise(function (resolve) {
        window.setTimeout(resolve, 4000);
      })
    ]);
  }

  var edits = 0;

  nextButton.addEventListener("click", function () {
    var leaving = current;
    var editsAtClick = edits;
    var label = nextButton.textContent;
    nextButton.disabled = true;
    nextButton.textContent = "Checking…";
    pendingLookups(steps[leaving]).then(function () {
      nextButton.disabled = false;
      nextButton.textContent = label;
      /* If they changed something while we waited, let them press again. */
      if (edits !== editsAtClick || current !== leaving) return;
      if (validateStep(leaving)) goTo(leaving + 1);
    });
  });

  prevButton.addEventListener("click", function () {
    goTo(current - 1);
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
  });

  /* ---------- sending ---------- */

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

  /* Some desktop email apps cut off very long mailto: links. */
  var SAFE_MAILTO_LENGTH = 1900;

  sendButton.addEventListener("click", function () {
    if (!validateStep(current)) return;
    var text = enquiryText();
    var href =
      "mailto:" + readEmail() +
      "?subject=" + encodeURIComponent(subject()) +
      "&body=" + encodeURIComponent(text);
    var long = href.length > SAFE_MAILTO_LENGTH;

    copyText(text).then(
      function () {
        sendStatus.textContent = long
          ? "Your email app is opening. The enquiry is long, so it is also copied: if the email looks cut short, paste over it."
          : "Your email app is opening with the enquiry filled in. It is also copied to your clipboard, just in case.";
      },
      function () {
        sendStatus.textContent =
          "Your email app is opening with the enquiry filled in. Check it is all there before you send.";
      }
    );
    window.location.href = href;
  });

  copyButton.addEventListener("click", function () {
    copyText(enquiryText()).then(
      function () {
        sendStatus.textContent = "Enquiry copied. Paste it into an email to " + readEmail() + ".";
      },
      function () {
        sendStatus.textContent = "Copying is blocked in this browser. Use Send enquiry by email instead.";
      }
    );
  });

  /* ---------- wiring ---------- */

  function refresh() {
    updateConditionals();
    updateQtyTotal();
    renderEstimate();
    updateSide();
  }

  /* Old error messages go as soon as the visitor starts fixing things;
     Continue checks the step again. */
  function onEdit() {
    if (!fillingRegion) edits += 1;
    refresh();
    if (!errorBox.hidden) clearErrors(steps[current]);
  }

  form.addEventListener("input", onEdit);
  form.addEventListener("change", onEdit);

  var start = field("startDate");
  if (start) start.min = todayIso();

  refresh();
  steps.forEach(function (step, i) {
    step.hidden = i !== 0;
  });
})();
