// Wild Within — interaction layer (works on homepage + all interior pages)
document.addEventListener("DOMContentLoaded", () => {

  // === NAV: mobile toggle + scroll state ===
  const header = document.querySelector(".site-header");
  const navbar = document.getElementById("navbar");
  const nav = header || navbar;

  // Mobile toggle (interior pages use .nav-toggle, homepage uses .menu-toggle)
  const toggle = document.querySelector(".nav-toggle") || document.getElementById("menuToggle");
  const navLinks = document.querySelector(".nav-links") || document.getElementById("navLinks");

  if (toggle && navLinks) {
    toggle.addEventListener("click", () => {
      if (header) header.classList.toggle("nav-open");
      navLinks.classList.toggle("open");
      const expanded = navLinks.classList.contains("open") || (header && header.classList.contains("nav-open"));
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    });
    navLinks.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
      navLinks.classList.remove("open");
      if (header) header.classList.remove("nav-open");
    }));
  }

  // === SCROLL PROGRESS BAR ===
  let sp = document.querySelector(".scroll-progress") || document.getElementById("scrollProgress");
  if (!sp) {
    sp = document.createElement("div");
    sp.className = "scroll-progress";
    document.body.appendChild(sp);
  }

  // === SCROLL HANDLER: progress bar + nav frosted glass ===
  const onScroll = () => {
    const h = document.documentElement;
    const pct = (window.scrollY / (h.scrollHeight - h.clientHeight)) * 100;
    if (sp) sp.style.width = pct + "%";
    if (nav) nav.classList.toggle("scrolled", window.scrollY > 50);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // === SMOOTH SCROLL for in-page anchors ===
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener("click", function(e) {
      const id = this.getAttribute("href");
      if (id.length > 1) {
        const t = document.querySelector(id);
        if (t) { e.preventDefault(); window.scrollTo({ top: t.offsetTop - 80, behavior: "smooth" }); }
      }
    });
  });

  // === REVEAL ON SCROLL (auto-tag + observe) ===
  // Auto-tag elements on interior pages that should animate in
  const autoRevealSelectors = [
    ".section h2", ".section .eyebrow", ".section .grid",
    ".section .two-col", ".section .prose", ".card",
    ".quote", ".checklist", ".faq details:first-of-type",
    ".page-header h1", ".page-header p"
  ];
  document.querySelectorAll(autoRevealSelectors.join(", ")).forEach(el => {
    if (!el.classList.contains("reveal") && !el.classList.contains("reveal-left") && !el.classList.contains("reveal-right") && !el.closest(".stagger")) {
      el.classList.add("reveal");
    }
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    document.querySelectorAll(".reveal, .reveal-left, .reveal-right, .stagger").forEach(el => io.observe(el));
  } else {
    document.querySelectorAll(".reveal, .reveal-left, .reveal-right").forEach(el => el.classList.add("visible"));
    document.querySelectorAll(".stagger").forEach(el => {
      el.classList.add("visible");
      el.querySelectorAll(":scope > *").forEach(c => { c.style.opacity = "1"; c.style.transform = "none"; });
    });
  }

  // === TESTIMONIAL CAROUSEL (homepage only) ===
  const cards = document.querySelectorAll(".testimonial-card");
  const dots = document.querySelectorAll(".testimonial-dot");
  if (cards.length > 0 && dots.length > 0) {
    let curr = 0;
    function showTestimonial(i) {
      cards.forEach(c => c.classList.remove("active"));
      dots.forEach(d => d.classList.remove("active"));
      cards[i].classList.add("active");
      dots[i].classList.add("active");
      curr = i;
    }
    dots.forEach(d => d.addEventListener("click", () => {
      clearInterval(tInterval);
      showTestimonial(parseInt(d.dataset.i));
      tInterval = setInterval(() => showTestimonial((curr + 1) % cards.length), 6000);
    }));
    let tInterval = setInterval(() => showTestimonial((curr + 1) % cards.length), 6000);
  }

  // === CONTACT FORM preview-only ===
  const form = document.querySelector("form.contact-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      let note = form.querySelector(".form-status");
      if (!note) {
        note = document.createElement("p");
        note.className = "form-status";
        note.style.cssText = "margin-top:1rem;padding:1rem 1.25rem;background:rgba(192,139,110,.12);border:1px solid rgba(192,139,110,.3);border-radius:14px;font-size:.92rem;color:#A6725A;";
        form.appendChild(note);
      }
      note.textContent = "Thanks! This is a preview build. On the live site this message would reach Alicia directly.";
    });
  }
});
