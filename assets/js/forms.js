/* ==========================================================================
   TRIUMPH HOOPS ACADEMY — FORMS
   --------------------------------------------------------------------------
   Rules this file follows:
   1. A form NEVER shows success unless the server confirmed the email was
      accepted. A failed send says so, and hands the family a working email
      link instead so nobody is stranded.
   2. Forms also work with JavaScript disabled: they post natively to the
      same endpoint and land on thank-you.html.
   3. No secrets. This file only knows the endpoint URL.
   ========================================================================== */
(function () {
  "use strict";

  var DATA = window.TRIUMPH_DATA || {};
  var ENDPOINT = (DATA.forms && DATA.forms.endpoint) || "/api/inquiry";
  var EMAIL_TO = (DATA.contactInfo && DATA.contactInfo.email) || "triumphhoopsacademy@gmail.com";
  var CONTACT = DATA.contactInfo || {};

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function fieldWrap(input) { return input.closest(".field") || input.parentNode; }

  function errorEl(input) {
    var id = input.id + "-error";
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement("p");
      el.id = id;
      el.className = "field-error";
      fieldWrap(input).appendChild(el);
    }
    return el;
  }

  function setError(input, message) {
    var el = errorEl(input);
    el.textContent = message;
    el.classList.add("is-visible");
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", el.id);
  }

  function clearError(input) {
    var el = document.getElementById(input.id + "-error");
    if (el) { el.textContent = ""; el.classList.remove("is-visible"); }
    input.removeAttribute("aria-invalid");
  }

  function labelFor(input) {
    var wrap = fieldWrap(input);
    var label = $(".label", wrap) || $("label", wrap);
    return (label ? label.textContent : "This field").replace(/\*/g, "").trim();
  }

  function validateField(input) {
    var value = (input.value || "").trim();
    var isCheckbox = input.type === "checkbox";

    if (input.required && ((isCheckbox && !input.checked) || (!isCheckbox && !value))) {
      setError(input, isCheckbox ? "Please check this box to continue." : labelFor(input) + " is required.");
      return false;
    }
    if (input.type === "email" && value && !EMAIL_RE.test(value)) {
      setError(input, "Enter a valid email address, like name@email.com.");
      return false;
    }
    if (input.type === "tel" && value && value.replace(/\D/g, "").length < 10) {
      setError(input, "Enter a 10-digit phone number.");
      return false;
    }
    clearError(input);
    return true;
  }

  function validateForm(form) {
    var fields = $$("input, select, textarea", form).filter(function (el) {
      return el.type !== "hidden" && !el.closest(".hp");
    });
    var firstBad = null;
    fields.forEach(function (el) {
      if (!validateField(el) && !firstBad) firstBad = el;
    });
    if (firstBad) {
      firstBad.focus();
      if (firstBad.scrollIntoView) {
        firstBad.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
    return !firstBad;
  }

  function collect(form) {
    var out = {};
    new FormData(form).forEach(function (value, key) {
      out[key] = typeof value === "string" ? value.trim() : value;
    });
    return out;
  }

  /* Fallback: a pre-filled email so a family can still reach Triumph if the
     endpoint is unreachable. Nothing is silently lost. */
  function mailtoFallback(payload) {
    var lines = [];
    Object.keys(payload).forEach(function (key) {
      if (key === "hp_company" || key === "form_started" || !payload[key]) return;
      lines.push(key.replace(/_/g, " ").toUpperCase() + ": " + payload[key]);
    });
    var subject = "Website inquiry — " + (payload.player_name || payload.parent_name || "New inquiry");
    return "mailto:" + EMAIL_TO +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(lines.join("\n"));
  }

  function escapeText(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function showStatus(form, type, html) {
    var status = $(".form-status", form);
    if (!status) return;
    status.innerHTML = '<span class="' + type + '">' + html + "</span>";
    status.setAttribute("role", "status");
  }

  function succeed(form) {
    var wrap = form.closest(".form-wrap") || form;
    var name = form.getAttribute("data-success-heading") || "Thanks for reaching out to Triumph.";
    var body = form.getAttribute("data-success-body") ||
      "We'll review your information and help identify the best next step for your player.";

    wrap.innerHTML =
      '<div class="stack" tabindex="-1" id="' + form.id + '-success">' +
        '<p class="eyebrow">Received</p>' +
        '<h3 class="h3">' + name + "</h3>" +
        '<p class="lead">' + body + "</p>" +
        '<p class="small muted">Most families hear back within a couple of days. If your question is time-sensitive, email ' +
        '<a href="mailto:' + EMAIL_TO + '">' + EMAIL_TO + "</a>.</p>" +
      "</div>";

    var focusTarget = document.getElementById(form.id + "-success");
    if (focusTarget) focusTarget.focus();
  }

  function handle(form) {
    /* Timestamp lets the server reject instant bot submissions. */
    var started = $("input[name='form_started']", form);
    if (started) started.value = String(Date.now());

    $$("input, select, textarea", form).forEach(function (el) {
      el.addEventListener("blur", function () { if (el.value || el.required) validateField(el); });
      el.addEventListener("input", function () {
        if (el.getAttribute("aria-invalid") === "true") validateField(el);
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      /* Guard 1: a submission is already in flight. Prevents a double tap on
         a phone from sending the same family twice. */
      if (form.getAttribute("data-submitting") === "true") return;
      if (!validateForm(form)) return;

      var button = $("button[type='submit']", form);
      var original = button ? button.textContent : "";
      var payload = collect(form);

      function unlock() {
        form.removeAttribute("data-submitting");
        if (button) {
          button.disabled = false;
          button.removeAttribute("aria-busy");
          button.textContent = original;
        }
      }

      /* Guard 2: lock the form and the button for the duration of the request. */
      form.setAttribute("data-submitting", "true");
      if (button) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.textContent = "Submitting…";
      }
      showStatus(form, "ok", "Submitting your information…");

      /* Guard 3: never hang forever on a dead connection. */
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timedOut = false;
      var timer = setTimeout(function () {
        timedOut = true;
        if (controller) controller.abort();
      }, 20000);

      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
          });
        })
        .then(function (result) {
          clearTimeout(timer);

          /* Success ONLY when the server confirms the email was accepted.
             A 200 without delivered:true is still a failure. */
          if (result.ok && result.body && result.body.delivered === true) {
            succeed(form);
            return;
          }

          /* A 400 means the family can fix it themselves — say what is wrong. */
          if (result.status === 400 && result.body && result.body.error) {
            unlock();
            showStatus(form, "err",
              "<strong>Check one more thing.</strong><br>" +
              escapeText(result.body.error) +
              "<br>Your information is still here — correct that field and submit again.");
            return;
          }

          if (result.status === 429) {
            unlock();
            showStatus(form, "err",
              "<strong>One moment.</strong><br>" +
              "That was submitted a few times in a row. Wait about a minute and press submit again — " +
              "your information has been kept.");
            return;
          }

          throw new Error("server");
        })
        .catch(function (err) {
          clearTimeout(timer);
          unlock();

          var offline = typeof navigator !== "undefined" && navigator.onLine === false;
          var headline = offline
            ? "You appear to be offline."
            : "We couldn't submit your form.";
          var explain = offline
            ? "Reconnect and press submit again — nothing you typed has been lost."
            : "Your information has been preserved. Please try again.";
          if (timedOut && !offline) {
            explain = "The connection timed out. Your information has been preserved — please try again.";
          }

          var phone = CONTACT.phoneHref && CONTACT.phoneDisplay
            ? ' or call ' + (CONTACT.phoneContactName || "Triumph") + ' at <a href="tel:' +
              CONTACT.phoneHref + '">' + CONTACT.phoneDisplay + "</a>"
            : "";

          showStatus(
            form,
            "err",
            "<strong>" + headline + "</strong><br>" + explain +
              "<br>If the problem continues, contact Triumph Hoops Academy at " +
              '<a href="mailto:' + EMAIL_TO + '">' + EMAIL_TO + "</a>" + phone + "." +
              '<br><a href="' + mailtoFallback(payload) +
              '">Or send what you already typed by email &rarr;</a>'
          );
        });
    });
  }

  function init() { $$("form[data-inquiry]").forEach(handle); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
