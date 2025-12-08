(function () {
    const cfg = window.APP_CONFIG;

    const data = { sections: [], flat: [] };
    const indexById = new Map();
    let currentIndex = 0;
    let answers = {};
    let prefilled = null;
    let lastAssessmentResult = null; 

    const sectionList = document.getElementById("sectionList");
    const questionArea = document.getElementById("questionArea");
    const progressBar = document.getElementById("progressBar");
    const progressLabel = document.getElementById("progressLabel");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const submitBtn = document.getElementById("submitBtn");
    const submitStatus = document.getElementById("submitStatus");
    const resetBtn = document.getElementById("resetBtn");

    const storageKey = "assessment_answers_v1";

    function saveLocal() {
        localStorage.setItem(storageKey, JSON.stringify(answers));
    }

    function loadLocal() {
        try {
            return JSON.parse(localStorage.getItem(storageKey) || "{}");
        } catch {
            return {};
        }
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    function computeProgress() {
        const total = data.flat.length;
        const done = Object.keys(answers).length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        progressBar.style.width = pct + "%";
        progressLabel.textContent = `${pct}% complete`;
    }

    function renderSections() {
        sectionList.innerHTML = "";
        data.sections.forEach((sec) => {
            const doneInSec = sec.items.filter((q) => answers[q.id] !== undefined).length;
            const pill = document.createElement("button");
            pill.className = "section-pill" + (sec.containsIndex(currentIndex) ? " active" : "");
            pill.type = "button";
            pill.innerHTML = `<span>${sec.name}</span><span class="count">${doneInSec}/${sec.items.length}</span>`;
            pill.addEventListener("click", () => {
                currentIndex = indexById.get(sec.items[0].id);
                updateUI();
            });
            sectionList.appendChild(pill);
        });
    }

    async function downloadPDF() {
        if (!lastAssessmentResult) {
            alert("No assessment results available. Please complete and submit the assessment first.");
            return;
        }

        try {
            const catalyst = document.getElementById("catalystSelect").value;
            
            const pdfData = {
                catalyst: catalyst,
                overall_score: lastAssessmentResult.overall_score,
                overall_tier: lastAssessmentResult.overall_tier,
                priority_categories: lastAssessmentResult.priority_categories,
                category_details: lastAssessmentResult.category_details,
                recommendations: lastAssessmentResult.recommendations
            };

            const response = await fetch("http://127.0.0.1:8000/export-pdf", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(pdfData)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;
            link.download = `SBDC_Assessment_Results_${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Failed to download PDF:", err);
            alert("Failed to download PDF. Please try again.");
        }
    }

    function renderQuestion() {
        const q = data.flat[currentIndex];
        if (!q) {
            questionArea.innerHTML = '<div class="loading">No questions found.</div>';
            return;
        }

        const entries = Object.entries(q.scoring_scale);
        const selected = answers[q.id];

        const tiles = entries
            .map(([value, label]) => {
                const isSel = selected === value;
                return `<button class="tile ${isSel ? "selected" : ""}" data-value="${value}" aria-pressed="${isSel}">
                    <div class="value">${value}</div>
                    <div class="label">${label}</div>
                </button>`;
            })
            .join("");

        questionArea.innerHTML = `
            <article class="question-card" data-qid="${q.id}">
                <div class="question-text">${q.question}</div>
                <div class="tile-grid" role="group" aria-label="Answer choices for ${q.id}">
                    ${tiles}
                </div>
            </article>
        `;

        questionArea.querySelectorAll(".tile").forEach((btn) => {
            btn.addEventListener("click", () => {
                const val = btn.getAttribute("data-value");
                answers[q.id] = val;
                saveLocal();
                questionArea.querySelectorAll(".tile").forEach((b) => {
                    const sel = b === btn;
                    b.classList.toggle("selected", sel);
                    b.setAttribute("aria-pressed", sel ? "true" : "false");
                });
                if (currentIndex < data.flat.length - 1) {
                    currentIndex += 1;
                    updateUI();
                } else {
                    computeProgress();
                }
            });
        });
    }

    function updateNavButtons() {
        prevBtn.disabled = currentIndex <= 0;
        nextBtn.disabled = currentIndex >= data.flat.length - 1;
    }

    function updateUI() {
        computeProgress();
        renderSections();
        renderQuestion();
        updateNavButtons();
    }

    prevBtn.addEventListener("click", () => {
        currentIndex = clamp(currentIndex - 1, 0, data.flat.length - 1);
        updateUI();
    });

    nextBtn.addEventListener("click", () => {
        currentIndex = clamp(currentIndex + 1, 0, data.flat.length - 1);
        updateUI();
    });

    resetBtn.addEventListener("click", () => {
        if (confirm("Erase all answers?")) {
            answers = {};
            saveLocal();
            lastAssessmentResult = null;
    
            setAssessmentDisabled(false);
            questionArea.classList.remove("hidden");
            document.getElementById("results").classList.add("hidden");
    
            updateUI();
        }
    });

    function setAssessmentDisabled(disabled) {
        prevBtn.disabled = disabled;
        nextBtn.disabled = disabled;
    
        sectionList.querySelectorAll("button").forEach(btn => {
            btn.disabled = disabled;
        });
    }

    function showResults(out) {
        lastAssessmentResult = out; 
        setAssessmentDisabled(true);

        const resultsEl = document.getElementById("results");
        questionArea.innerHTML = "";
        questionArea.classList.add("hidden");

        resultsEl.classList.remove("hidden");

        let recommendationsHTML = "";
        if (Array.isArray(out.recommendations)) {
            recommendationsHTML = out.recommendations
                .map(rec => `
                    <div class="recommendation">
                        ${marked.parse(rec)}
                    </div>
                `)
                .join("");
        } else {
            recommendationsHTML = `
                <div class="recommendation">
                    ${marked.parse(out.recommendations)}
                </div>
            `;
        }

        resultsEl.innerHTML = `
            <h2 style="text-align: center;">
                Congrats on taking the next step to move your business forward!
            </h2>

            <div class="action-buttons"
                 style="display: flex; justify-content: center; gap: 12px; margin: 16px 0;">
                
                <button id="downloadPdfBtn" type="button">
                    Download Results
                </button>

                <button id="bookCall" type="button">
                    Book a Call
                </button>

                <button type="button">
                    View More Resources
                </button>
                
            </div>

            <div class="result-block">
                <h3>Recommendations</h3>
                ${recommendationsHTML}
            </div>
        `;

        document.getElementById("downloadPdfBtn").addEventListener("click", downloadPDF);
    }

    submitBtn.addEventListener("click", async () => {
        submitStatus.textContent = "Submitting…";
        submitBtn.disabled = true;

        try {
            const filteredAnswers = Object.entries(answers)
                .filter(([_, value]) => value !== "N/A")
                .map(([question_id, value]) => ({
                    question_id,
                    score: parseInt(value, 10),
                    notes: null
                }));

            const payload = {
                catalyst: document.getElementById("catalystSelect").value,
                answers: filteredAnswers
            };

            const res = await fetch(cfg.submitUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const out = await res.json().catch(() => ({}));

            submitStatus.textContent = "Saved ✓";
            showResults(out);

        } catch (err) {
            console.error(err);
            submitStatus.textContent = "Could not submit";
        } finally {
            submitBtn.disabled = false;
        }
    });

    async function fetchJSON(path) {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`Failed to load ${path}`);
        return res.json();
    }

    async function boot() {
        try {
            const [questions] = await Promise.all([
                fetchJSON(cfg.dataPaths.questions),
                fetchJSON(cfg.dataPaths.functionalAreas)
            ]);

            const sections = Object.keys(questions.assessment).map((name) => {
                const items = questions.assessment[name];
                return {
                    name,
                    items,
                    containsIndex: (idx) => {
                        const first = items[0]?.id;
                        const last = items[items.length - 1]?.id;
                        const firstIdx = indexById.get(first);
                        const lastIdx = indexById.get(last);
                        return idx >= firstIdx && idx <= lastIdx;
                    }
                };
            });

            const flat = [];
            sections.forEach((sec) => sec.items.forEach((q) => flat.push(q)));
            flat.forEach((q, i) => indexById.set(q.id, i));

            data.sections = sections;
            data.flat = flat;

            answers = loadLocal();

            if (cfg.prefillUrl) {
                try {
                    const res = await fetch(cfg.prefillUrl);
                    if (res.ok) {
                        prefilled = await res.json();
                        Object.assign(answers, prefilled || {});
                    }
                } catch {}
            }

            updateUI();

        } catch (err) {
            console.error(err);
        }
    }

    boot();
})();
