/* ==========================================================================
   TRIUMPH HOOPS ACADEMY — SITE BEHAVIOR
   Vanilla JS, no dependencies. Everything here is progressive enhancement:
   the site is fully readable and usable if this file never loads.
   ========================================================================== */
(function () {
  "use strict";

  var DATA = window.TRIUMPH_DATA || {};
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ------------------------------------------------------------------
     1. CONTACT INFO HYDRATION
     Any element with data-site="contactInfo.email" gets its value from
     site-data.js, so contact details exist in exactly one place.
     ------------------------------------------------------------------ */
  function hydrate() {
    var contact = DATA.contactInfo || {};

    $$("[data-site]").forEach(function (el) {
      var path = el.getAttribute("data-site").split(".");
      var val = DATA;
      for (var i = 0; i < path.length; i++) {
        val = val && val[path[i]];
      }
      if (val === undefined || val === null || val === "") return;
      if (el.tagName === "A" && el.hasAttribute("data-site-href")) {
        el.setAttribute("href", el.getAttribute("data-site-href").replace("{value}", val));
      }
      el.textContent = val;
    });

    /* Phone links: only become real links once a number is supplied. */
    $$("[data-phone-link]").forEach(function (el) {
      if (contact.phoneHref) {
        el.setAttribute("href", "tel:" + contact.phoneHref);
      } else {
        el.removeAttribute("href");
        el.setAttribute("aria-disabled", "true");
      }
      var label = $("[data-phone-display]", el) || el;
      label.textContent = contact.phoneDisplay || "";
    });

    /* Optional social links hide themselves when no URL is configured. */
    $$("[data-social]").forEach(function (el) {
      var key = el.getAttribute("data-social");
      var url = contact[key];
      if (url) { el.setAttribute("href", url); } else { el.hidden = true; }
    });
  }

  /* ------------------------------------------------------------------
     2. HEADER + MOBILE MENU
     ------------------------------------------------------------------ */
  function header() {
    var head = $(".site-header");
    var toggle = $(".nav-toggle");
    var menu = $("#mobile-menu");

    if (head) {
      var onScroll = function () {
        head.classList.toggle("is-stuck", window.scrollY > 8);
      };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    if (!toggle || !menu) return;

    function close() {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
    function open() {
      menu.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
    }

    toggle.addEventListener("click", function () {
      toggle.getAttribute("aria-expanded") === "true" ? close() : open();
    });

    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) close();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        close();
        toggle.focus();
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth >= 1000) close();
    });
  }

  /* ------------------------------------------------------------------
     3. SCROLL REVEALS
     ------------------------------------------------------------------ */
  function reveals() {
    var items = $$("[data-reveal]");
    if (!items.length) return;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var delay = parseInt(el.getAttribute("data-reveal-delay") || "0", 10);
        setTimeout(function () { el.classList.add("is-in"); }, delay);
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------
     4. ACCORDION (FAQ)
     ------------------------------------------------------------------ */
  function accordions() {
    $$(".accordion-trigger").forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      if (!panel) return;

      btn.addEventListener("click", function () {
        var isOpen = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!isOpen));
        panel.classList.toggle("is-open", !isOpen);
      });
    });

    /* Open an item that was linked to directly, e.g. /junior-wolves#faq-fees */
    if (window.location.hash) {
      var target = document.querySelector(window.location.hash);
      var item = target && target.closest(".accordion-item");
      if (item) {
        var trigger = $(".accordion-trigger", item);
        var panel = $(".accordion-panel", item);
        if (trigger && panel) {
          trigger.setAttribute("aria-expanded", "true");
          panel.classList.add("is-open");
        }
      }
    }
  }

  /* ------------------------------------------------------------------
     5. JUNIOR WOLVES JUMP NAV — highlights the section you are reading
     ------------------------------------------------------------------ */
  function jumpNav() {
    var nav = $(".jumpnav");
    if (!nav || !("IntersectionObserver" in window)) return;

    var links = $$("a", nav);
    var map = {};
    var sections = links.map(function (link) {
      var id = link.getAttribute("href").replace("#", "");
      var section = document.getElementById(id);
      if (section) map[id] = link;
      return section;
    }).filter(Boolean);

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (l) { l.classList.remove("is-active"); });
        var active = map[entry.target.id];
        if (active) {
          active.classList.add("is-active");
          /* keep the active chip visible in the scrolling strip */
          var left = active.offsetLeft - nav.clientWidth / 2 + active.clientWidth / 2;
          nav.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? "auto" : "smooth" });
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });

    sections.forEach(function (s) { io.observe(s); });
  }

  /* ------------------------------------------------------------------
     6. RENDER VOLATILE PROGRAM DATA FROM site-data.js
     ------------------------------------------------------------------ */
  function tbd(value) {
    if (!value || value === "TBA" || value === "TBD") {
      return '<span class="tbd">To be announced</span>';
    }
    return esc(value);
  }

  function renderSunday() {
    var host = $("[data-render='sunday']");
    if (!host || !DATA.trainingSchedule) return;

    host.innerHTML = DATA.trainingSchedule.sunday.map(function (s) {
      return (
        '<article class="card">' +
          '<p class="card-index">' + esc(s.time) + (s.status ? " &middot; " + esc(s.status) : "") + "</p>" +
          '<h3 class="h3">' + esc(s.title) + "</h3>" +
          '<p class="label muted">' + esc(s.who) + "</p>" +
          "<p>" + esc(s.detail) + "</p>" +
          (s.coach ? '<p class="small muted">Led by ' + esc(s.coach) + "</p>" : "") +
        "</article>"
      );
    }).join("");

    var note = $("[data-render='sunday-note']");
    if (note) note.textContent = DATA.trainingSchedule.sundayNote || "";
  }

  function renderWeekly() {
    var lead = $("[data-render='weekly-lead']");
    var note = $("[data-render='weekly-note']");
    if (lead && DATA.trainingSchedule) lead.textContent = DATA.trainingSchedule.weeklyLead || "";
    if (note && DATA.trainingSchedule) note.textContent = DATA.trainingSchedule.weeklyNote || "";
  }

  function renderLocations() {
    var host = $("[data-render='locations']");
    if (!host || !DATA.locations) return;

    host.innerHTML = DATA.locations.map(function (loc) {
      var addr = loc.address && loc.address.indexOf("[") !== 0
        ? '<p class="small muted">' + esc(loc.address) + "</p>"
        : '<p class="small"><span class="tbd">Address coming soon</span></p>';
      return (
        '<article class="card">' +
          '<h3 class="h4">' + esc(loc.name) + "</h3>" +
          '<p class="small muted">' + esc(loc.area) + "</p>" +
          addr +
        "</article>"
      );
    }).join("");
  }

  function renderStaff() {
    var host = $("[data-render='staff']");
    if (!host || !DATA.staff) return;

    host.innerHTML = DATA.staff.map(function (person) {
      /* Photo slot — drop a file in /assets/img/ and set "photo" in site-data.js */
      var media = person.photo
        ? '<img src="' + esc(person.photo) + '" alt="' + esc(person.name) + '" loading="lazy" width="600" height="750" style="border-radius:4px;aspect-ratio:4/5;object-fit:cover;width:100%">'
        : '<div class="media-slot media-slot--4x5"><span class="label">Coach photo</span></div>';
      return (
        '<article class="staff-card">' + media +
          '<h3 class="h4">' + esc(person.name) + "</h3>" +
          '<p class="staff-role">' + esc(person.role) + "</p>" +
          (person.bio ? '<p class="small muted">' + esc(person.bio) + "</p>" : "") +
        "</article>"
      );
    }).join("");
  }

  function renderJuniorWolves() {
    var season = DATA.juniorWolvesSeason || {};
    var fees = DATA.juniorWolvesFees || {};

    $$("[data-season]").forEach(function (el) {
      el.innerHTML = tbd(season[el.getAttribute("data-season")]);
    });
    $$("[data-fees]").forEach(function (el) {
      el.innerHTML = tbd(fees[el.getAttribute("data-fees")]);
    });

    var note = $("[data-render='schedule-note']");
    if (note) note.textContent = season.scheduleNote || "";
    var feeNote = $("[data-render='fee-note']");
    if (feeNote) feeNote.textContent = fees.note || "";
  }

  /* ------------------------------------------------------------------
     6b. JUNIOR WOLVES — FALL CAMPAIGN STATE
     Nothing here invents a link. Every CTA has a real destination or an
     honest "coming soon" state, driven by juniorWolvesFall in site-data.js.
     ------------------------------------------------------------------ */
  var JW_COPY = {
    scheduled: {
      cta: "Join the Junior Wolves list",
      navCta: "Junior Wolves list",
      heading: "Tryout registration<br>opens September 8.",
      lead: "Registration goes live Tuesday, September 8. Add your player to the Junior Wolves " +
            "list now and we'll email you the moment it opens — along with Fall clinic " +
            "details. Joining the list does not reserve a roster spot.",
      submit: "Join the Junior Wolves list",
      source: "junior_wolves_interest",
      successHeading: "You're on the list.",
      successBody: "Thanks for your interest in Junior Wolves. Your information has been received " +
                   "by the Triumph Hoops Academy team. We'll keep you updated with upcoming " +
                   "Junior Wolves information and next steps.",
      keydate: "Tryout registration opens"
    },
    open: {
      cta: "Register for tryouts",
      navCta: "Tryout registration",
      heading: "Register for tryouts.",
      lead: "Registering signs your player up to be evaluated. It does not reserve a roster spot " +
            "— spots are earned at tryouts.",
      submit: "Register for tryouts",
      source: "junior_wolves_tryout",
      successHeading: "Registration received.",
      successBody: "We've received your player's Junior Wolves tryout registration. Additional " +
                   "tryout details will be shared as they are finalized.",
      keydate: "Tryout registration is open"
    }
  };

  function renderJuniorWolvesFall() {
    var fall = DATA.juniorWolvesFall;
    if (!fall) return;

    /* --- Official Junior Wolves logo, once a real file is supplied ------ */
    var mark = $("[data-jw-logo]");
    if (mark && fall.logo) {
      mark.classList.add("has-logo");
      mark.innerHTML = '<img src="' + esc(fall.logo) + '" alt="" width="220" height="220">';
    }

    /* --- Real Niles West photography, once a real file is supplied ------ */
    var media = $("[data-jw-hero-media]");
    if (media && fall.heroImage) {
      media.innerHTML = '<img src="' + esc(fall.heroImage) + '" alt="' +
        esc(fall.heroImageAlt || "Niles West basketball") +
        '" width="1000" height="1250" loading="eager">';
      media.hidden = false;
      var hero = $(".jw-hero");
      if (hero) hero.classList.add("has-media");
    }

    /* --- Virtual town hall link ---------------------------------------- */
    var th = $("[data-townhall-action]");
    var thUrl = fall.townHall && fall.townHall.url;
    if (th && thUrl) {
      th.innerHTML =
        '<a class="btn btn--primary btn--block" href="' + esc(thUrl) +
        '" target="_blank" rel="noopener">Join the virtual town hall</a>' +
        (fall.townHall.note ? '<p class="small muted">' + esc(fall.townHall.note) + "</p>" : "");
    }

    /* --- Tryout registration state ------------------------------------- */
    var reg = fall.tryoutRegistration || {};
    var copy = JW_COPY[reg.status === "open" ? "open" : "scheduled"];
    var isOpen = reg.status === "open";
    var regHref = isOpen && reg.url ? reg.url : "#register";

    $$('[data-reg="cta"]').forEach(function (el) {
      el.textContent = copy.cta;
      if (el.tagName === "A") {
        el.setAttribute("href", regHref);
        if (isOpen && reg.url) {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener");
        }
      }
    });

    $$('[data-reg="navCta"]').forEach(function (el) {
      el.textContent = copy.navCta;
      el.setAttribute("href", regHref);
      if (isOpen && reg.url) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener");
      }
    });

    var heading = $('[data-reg="heading"]');
    if (heading) heading.innerHTML = copy.heading;
    var lead = $('[data-reg="lead"]');
    if (lead) lead.textContent = copy.lead;
    var submit = $('[data-reg="submit"]');
    if (submit) submit.textContent = copy.submit;
    var keydate = $('[data-reg="keydate"]');
    if (keydate) keydate.textContent = copy.keydate;

    var form = document.getElementById("form-junior-wolves");
    if (form) {
      var sourceField = $("input[name='source']", form);
      if (sourceField) sourceField.value = copy.source;
      form.setAttribute("data-success-heading", copy.successHeading);
      form.setAttribute("data-success-body", copy.successBody);
    }

    var regAction = $("[data-registration-action]");
    if (regAction && isOpen) {
      regAction.innerHTML =
        '<span class="statechip statechip--accent">Registration open</span>' +
        '<a class="btn btn--primary btn--block" href="' + esc(regHref) + '"' +
        (reg.url ? ' target="_blank" rel="noopener"' : "") +
        ">Register for tryouts</a>";
    }

    /* --- Optional clinic signup link ----------------------------------- */
    var clinicUrl = fall.clinics && fall.clinics.url;
    if (clinicUrl) {
      var clinicCta = $("[data-clinic-cta]");
      if (clinicCta) {
        clinicCta.removeAttribute("data-reg");
        clinicCta.textContent = "Register for a clinic";
        clinicCta.setAttribute("href", clinicUrl);
        clinicCta.setAttribute("target", "_blank");
        clinicCta.setAttribute("rel", "noopener");
      }
    }
  }

  /* ------------------------------------------------------------------
     7. CTA-AWARE FORM SOURCES
     A link like <a href="#inquiry" data-set-source="aau_travel_interest">
     stamps the form it points at, so the email says exactly which button
     the family pressed.
     ------------------------------------------------------------------ */
  function sourceLinks() {
    $$("[data-set-source]").forEach(function (link) {
      link.addEventListener("click", function () {
        var targetId = (link.getAttribute("href") || "").replace("#", "");
        var section = document.getElementById(targetId);
        var form = section && (section.matches("form") ? section : $("form", section));
        if (!form) return;
        var field = $("input[name='source']", form);
        if (field) field.value = link.getAttribute("data-set-source");
        var echo = $("[data-source-echo]", form);
        if (echo) echo.textContent = link.getAttribute("data-source-label") || "";
      });
    });
  }

  /* A <select data-source-select> whose options carry data-source="..."
     sets the lead source from the family's own answer. */
  function sourceSelects() {
    $$("select[data-source-select]").forEach(function (select) {
      select.addEventListener("change", function () {
        var option = select.options[select.selectedIndex];
        var value = option && option.getAttribute("data-source");
        var field = select.form && $("input[name='source']", select.form);
        if (value && field) field.value = value;
      });
    });
  }

  /* ------------------------------------------------------------------
     INIT
     ------------------------------------------------------------------ */
  function init() {
    hydrate();
    header();
    accordions();
    jumpNav();
    renderSunday();
    renderWeekly();
    renderLocations();
    renderStaff();
    renderJuniorWolves();
    renderJuniorWolvesFall();
    sourceLinks();
    sourceSelects();
    reveals(); /* last: observes elements rendered above */
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
