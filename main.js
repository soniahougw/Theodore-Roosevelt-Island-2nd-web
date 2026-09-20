document.addEventListener("DOMContentLoaded", () => {
    // Island hours per NPS: open 6 a.m. to 10 p.m. daily. Evaluate in DC time, not the visitor's.
    const OPEN_HOUR = 6;
    const CLOSE_HOUR = 22;

    const status = document.getElementById("open-status");
    const clock = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: "America/New_York",
    });

    const updateStatus = () => {
        const hour = Number(clock.format(new Date())) % 24;
        const isOpen = hour >= OPEN_HOUR && hour < CLOSE_HOUR;
        status.dataset.open = String(isOpen);
        status.textContent = isOpen
            ? "Open now \u00b7 closes 10 p.m."
            : "Closed now \u00b7 opens 6 a.m.";
    };

    if (status) {
        updateStatus();
        // keep it right if the tab stays open across 6 a.m. / 10 p.m.
        setInterval(updateStatus, 60 * 1000);
    }

    const year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();

    // Hero slideshow: cross-fades through the hero photos every few seconds.
    // Slide 1 is in the HTML; slides 2 and 3 are only fetched once the page has finished loading.
    const heroSlides = [...document.querySelectorAll(".hero-photo")];
    const hero = document.querySelector(".hero");
    const heroControls = document.querySelector(".hero-controls");

    if (heroSlides.length > 1 && hero && heroControls) {
        const SLIDE_MS = 3000;
        const FADE_MS = 1200;
        const TOUCH_HOLD_MS = 8000;
        const dots = [...heroControls.querySelectorAll(".hero-dot")];
        const pauseButton = heroControls.querySelector(".hero-pause");

        let current = 0;
        let timer = null;
        let userPaused = window.matchMedia("(prefers-reduced-motion: reduce)").matches; // starts paused if motion is unwelcome
        let hovering = false;
        let focusInside = false;
        let touchHoldUntil = 0;

        const isLoaded = (img) => img.complete && img.naturalWidth > 0;

        const showSlide = (index) => {
            if (index === current) return;
            const outgoing = heroSlides[current];
            const incoming = heroSlides[index];

            // The outgoing photo stays fully opaque underneath while the new one fades in on top.
            heroSlides.forEach((slide) => slide.classList.remove("is-prev"));
            outgoing.classList.remove("is-active");
            outgoing.classList.add("is-prev");
            outgoing.setAttribute("aria-hidden", "true");
            incoming.classList.add("is-active");
            incoming.removeAttribute("aria-hidden");
            setTimeout(() => outgoing.classList.remove("is-prev"), FADE_MS + 100);

            dots.forEach((dot, i) => dot.setAttribute("aria-current", String(i === index)));
            current = index;
        };

        const schedule = () => {
            clearTimeout(timer);
            if (userPaused || hovering || focusInside || document.hidden) return;
            timer = setTimeout(advance, SLIDE_MS);
        };

        const advance = () => {
            if (Date.now() >= touchHoldUntil) {
                for (let step = 1; step < heroSlides.length; step++) {
                    const next = (current + step) % heroSlides.length;
                    if (isLoaded(heroSlides[next])) {
                        showSlide(next);
                        break;
                    }
                }
            }
            schedule();
        };

        const goTo = (index) => {
            const slide = heroSlides[index];
            if (isLoaded(slide)) showSlide(index);
            else slide.addEventListener("load", () => showSlide(index), { once: true });
            schedule();
        };

        const syncPauseButton = () => {
            pauseButton.setAttribute("aria-pressed", String(userPaused));
            pauseButton.setAttribute("aria-label", userPaused ? "Play slideshow" : "Pause slideshow");
        };

        dots.forEach((dot, i) => dot.addEventListener("click", () => goTo(i)));
        pauseButton.addEventListener("click", () => {
            userPaused = !userPaused;
            syncPauseButton();
            schedule();
        });

        // Pause while the pointer is over the hero, while a touch is in progress (plus a short hold), and while focus is in the controls
        hero.addEventListener("pointerenter", (event) => {
            if (event.pointerType === "mouse") { hovering = true; schedule(); }
        });
        hero.addEventListener("pointerleave", (event) => {
            if (event.pointerType === "mouse") { hovering = false; schedule(); }
        });
        hero.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "touch") touchHoldUntil = Date.now() + TOUCH_HOLD_MS;
        }, { passive: true });
        heroControls.addEventListener("focusin", () => { focusInside = true; schedule(); });
        heroControls.addEventListener("focusout", () => { focusInside = false; schedule(); });
        document.addEventListener("visibilitychange", schedule);

        const startSlides = () => {
            heroSlides.forEach((img) => {
                if (!img.dataset.src) return;
                if (img.dataset.srcset) img.srcset = img.dataset.srcset;
                img.src = img.dataset.src;
            });
            heroControls.hidden = false;
            syncPauseButton();
            schedule();
        };

        if (document.readyState === "complete") startSlides();
        else window.addEventListener("load", startSlides, { once: true });
    }

    // People's Voice: live Google reviews via the Places API (New).
    //
    // Setup (one time):
    //   1. In Google Cloud, enable "Places API (New)" and create an API key. Billing must be on;
    //      Google bills Place Details requests per call (check current pricing and free monthly usage).
    //   2. Restrict the key: "Websites" (HTTP referrers) = your site's domain, and API = Places API (New).
    //      A referrer-restricted key will not work when the page is opened as a file:// URL; test from
    //      http://localhost/... (add it as an allowed referrer) or from your live domain.
    //   3. Paste the key into data-api-key on <section id="voices"> in index.html.
    //   Confirm data-place-id with Google's Place ID Finder if no reviews appear.
    //
    // Google's terms don't allow storing or copying review text, so this fetches on every visit and
    // shows the author name/link with each review. Until a key is set, only the "Read all reviews" link shows.
    const voices = document.getElementById("voices");
    const voiceSummary = document.getElementById("voice-summary");
    const voiceGrid = document.getElementById("voice-grid");

    if (voices && voiceSummary && voiceGrid && voices.dataset.apiKey && voices.dataset.placeId) {
        const make = (tag, className, text) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text !== undefined) node.textContent = text;
            return node;
        };
        // Only ever link/load https URLs that came back from the API
        const safeUrl = (value) => {
            try {
                const url = new URL(value);
                return url.protocol === "https:" ? url.href : null;
            } catch {
                return null;
            }
        };
        const starRow = (rating) => {
            const row = make("span", "stars", "\u2605\u2605\u2605\u2605\u2605");
            row.style.setProperty("--fill", `${(Math.max(0, Math.min(5, rating)) / 5) * 100}%`);
            row.setAttribute("role", "img");
            row.setAttribute("aria-label", `${rating} out of 5 stars`);
            return row;
        };

        const params = new URLSearchParams({
            fields: "rating,userRatingCount,reviews",
            languageCode: "en",
            key: voices.dataset.apiKey,
        });

        fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(voices.dataset.placeId)}?${params}`)
            .then((response) => {
                if (!response.ok) throw new Error(`Places API responded ${response.status}`);
                return response.json();
            })
            .then((place) => {
                if (typeof place.rating === "number") {
                    voiceSummary.append(make("strong", "voice-score", place.rating.toFixed(1)), starRow(place.rating));
                    if (place.userRatingCount) {
                        voiceSummary.append(make("span", "voice-count", `${place.userRatingCount.toLocaleString()} Google reviews`));
                    }
                    voiceSummary.hidden = false;
                }

                const reviews = (place.reviews || []).filter((review) => review.text && review.text.text).slice(0, 6);
                reviews.forEach((review) => {
                    const card = make("article", "voice-card");
                    const who = make("div", "voice-who");

                    const author = review.authorAttribution || {};
                    const photo = safeUrl(author.photoUri);
                    if (photo) {
                        const avatar = make("img");
                        avatar.src = photo;
                        avatar.alt = "";
                        avatar.width = 40;
                        avatar.height = 40;
                        avatar.loading = "lazy";
                        avatar.referrerPolicy = "no-referrer";
                        avatar.addEventListener("error", () => avatar.remove());
                        who.append(avatar);
                    }

                    const meta = make("div");
                    const profile = safeUrl(author.uri);
                    const name = profile ? make("a", "voice-name", author.displayName || "Google user") : make("span", "voice-name", author.displayName || "Google user");
                    if (profile) {
                        name.href = profile;
                        name.target = "_blank";
                        name.rel = "noopener";
                    }
                    meta.append(name, make("span", "voice-when", review.relativePublishTimeDescription || ""));
                    who.append(meta);

                    const body = make("p", "voice-text", review.text.text);
                    card.append(who, starRow(review.rating || 0), body);
                    voiceGrid.append(card);
                });

                if (reviews.length) {
                    voiceGrid.hidden = false;
                    // Offer "Read more" only on reviews that are actually cut off
                    requestAnimationFrame(() => {
                        voiceGrid.querySelectorAll(".voice-text").forEach((body) => {
                            if (body.scrollHeight <= body.clientHeight + 1) return;
                            const more = make("button", "voice-more", "Read more");
                            more.type = "button";
                            more.setAttribute("aria-expanded", "false");
                            more.addEventListener("click", () => {
                                const open = body.classList.toggle("is-open");
                                more.textContent = open ? "Show less" : "Read more";
                                more.setAttribute("aria-expanded", String(open));
                            });
                            body.after(more);
                        });
                    });
                }
            })
            .catch((error) => console.warn("Google reviews unavailable:", error.message));
    }

    // Trail explorer: choosing a trail (button, or the trail on the map) highlights it and shows its details.
    const xpMap = document.getElementById("xp-map");
    const xpList = document.querySelector(".xp-list");
    const xpPanels = [...document.querySelectorAll(".xp-panel")];

    if (xpMap && xpList && xpPanels.length) {
        const svgNS = "http://www.w3.org/2000/svg";
        const xpButtons = [...xpList.querySelectorAll(".xp-btn")];

        // Scatter tree canopy inside the island outline (seeded, so it looks the same every visit)
        const seeded = (seed) => () => {
            seed = (seed * 16807) % 2147483647;
            return (seed - 1) / 2147483646;
        };
        xpMap.querySelectorAll("[data-trees]").forEach((group) => {
            const random = seeded(42);
            for (let i = 0; i < 170; i++) {
                const tree = document.createElementNS(svgNS, "circle");
                tree.setAttribute("class", "xp-tree");
                tree.setAttribute("cx", (85 + random() * 235).toFixed(1));
                tree.setAttribute("cy", (10 + random() * 525).toFixed(1));
                tree.setAttribute("r", (5 + random() * 9).toFixed(1));
                group.append(tree);
            }
        });

        // A wider invisible copy of each trail, so it is easy to tap on a phone
        xpMap.querySelectorAll(".route").forEach((route) => {
            const hit = document.createElementNS(svgNS, "path");
            hit.setAttribute("class", "route-hit");
            hit.setAttribute("d", route.getAttribute("d"));
            hit.dataset.trail = route.dataset.trail;
            route.after(hit);
            hit.addEventListener("click", () => selectTrail(route.dataset.trail));
        });

        function selectTrail(key) {
            xpMap.dataset.active = key;
            xpButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.trail === key)));
            xpPanels.forEach((panel) => { panel.hidden = panel.dataset.trail !== key; });
        }

        xpButtons.forEach((button) => button.addEventListener("click", () => selectTrail(button.dataset.trail)));
        xpList.hidden = false; // the buttons only make sense with JavaScript
        selectTrail("swamp");
    }

    // Map layer toggle. The OpenStreetMap embed reads a `layer` URL parameter, so switching
    // layers is just reloading the iframe with a different value. Hidden until JS is available.
    const mapFrame = document.querySelector(".map-frame iframe");
    const mapControls = document.querySelector(".map-controls");
    const mapLink = document.getElementById("map-large");

    if (mapFrame && mapControls) {
        const baseTitle = mapFrame.title;
        const buttons = mapControls.querySelectorAll("button[data-layer]");
        // Layer codes used by openstreetmap.org's own "layers=" URL parameter
        const siteLayer = { mapnik: "", transportmap: "T" };

        mapControls.hidden = false;

        buttons.forEach((button) => {
            button.addEventListener("click", () => {
                const layer = button.dataset.layer;

                const src = new URL(mapFrame.src);
                src.searchParams.set("layer", layer);
                mapFrame.src = src.toString();
                mapFrame.title = layer === "mapnik" ? baseTitle : `${baseTitle} (${button.textContent})`;

                buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));

                if (mapLink) {
                    const link = new URL(mapLink.href);
                    const code = siteLayer[layer];
                    link.hash = `map=16/38.89541/-77.06220${code ? `&layers=${code}` : ""}`;
                    mapLink.href = link.toString();
                }
            });
        });
    }

    // Photo lightbox: tapping a gallery photo opens it full-size in a <dialog>.
    // Without JS (or <dialog> support) the links simply open the image itself.
    const photoLinks = [...document.querySelectorAll(".gallery .lb-link")];
    const lightbox = document.getElementById("lightbox");

    if (photoLinks.length && lightbox && typeof lightbox.showModal === "function") {
        const lbImg = document.getElementById("lightbox-img");
        const lbCaption = document.getElementById("lightbox-caption");
        const lbCount = document.getElementById("lightbox-count");
        let current = 0;

        const show = (i) => {
            current = (i + photoLinks.length) % photoLinks.length;
            const link = photoLinks[current];
            const thumb = link.querySelector("img");
            lbImg.src = link.href;
            lbImg.alt = thumb.alt;
            lbCaption.textContent = link.closest("figure").querySelector("figcaption").textContent.trim();
            lbCount.textContent = `${current + 1} / ${photoLinks.length}`;
        };

        photoLinks.forEach((link, i) => {
            link.addEventListener("click", (event) => {
                event.preventDefault();
                show(i);
                document.documentElement.classList.add("lb-open");
                lightbox.showModal();
            });
        });

        lightbox.querySelector(".lb-close").addEventListener("click", () => lightbox.close());
        lightbox.querySelector(".lb-prev").addEventListener("click", () => show(current - 1));
        lightbox.querySelector(".lb-next").addEventListener("click", () => show(current + 1));

        // Clicking the dark area around the photo closes it (Esc is handled natively by <dialog>)
        lightbox.addEventListener("click", (event) => {
            if (event.target === lightbox) lightbox.close();
        });

        lightbox.addEventListener("keydown", (event) => {
            if (event.key === "ArrowLeft") show(current - 1);
            if (event.key === "ArrowRight") show(current + 1);
        });

        // Swipe left/right on touch screens
        let touchStart = null;
        lightbox.addEventListener("touchstart", (event) => {
            touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }, { passive: true });
        lightbox.addEventListener("touchend", (event) => {
            if (!touchStart) return;
            const dx = event.changedTouches[0].clientX - touchStart.x;
            const dy = event.changedTouches[0].clientY - touchStart.y;
            touchStart = null;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(current + (dx < 0 ? 1 : -1));
        }, { passive: true });

        lightbox.addEventListener("close", () => {
            document.documentElement.classList.remove("lb-open");
            lbImg.removeAttribute("src");
        });
    }
});
