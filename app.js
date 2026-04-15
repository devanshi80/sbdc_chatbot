(function () {
    const cfg = window.APP_CONFIG;

    const data = { sections: [], flat: [] };
    const indexById = new Map();
    let currentIndex = 0;
    let answers = {};
    let areaNotes = {};
    let prefilled = null;
    let lastAssessmentResult = null; 
    const assessmentFocusDefinitions = {
        "Economic Uncertainty": "The economy or market conditions are changing, and I’m unsure how it will impact my business.",
        "Crisis or Setback": "Something urgent or unexpected happened, and I need to stabilize my business quickly.",
        "New Opportunity": "I have a new idea or opportunity and want to evaluate or pursue it thoughtfully.",
        "Steady Growth": "Business is going well, and I want to grow or scale in a sustainable way.",
        "Lifestyle Change": "Something in my personal life has changed, and I need my business to adapt.",
        "Operational Adjustments": "I’m making changes to systems, processes, or tools and want to manage the transition well."
    };
    const areaNoteIntro = "Share as much or as little detail as you'd like. You can skip this if you're unsure or if you do not have anything to add.";
    const areaNotePrompts = {
        Financials: "What feels most unclear, challenging, or important in your business finances right now?",
        Operations: "What part of your day-to-day operations is currently the most difficult, time-consuming, or inefficient?",
        Employees: "What’s working well with your team—and where could additional support, clarity, or capacity help?",
        Customers_Marketing: "How are customers currently finding and experiencing your business—and what seems to be working or not working?",
        Products_Services: "How well do your current (or planned) products or services align with customer demand right now?",
        Leadership: "What feels most challenging or important about your role as a business owner or decision-maker right now?"
    };
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
        localStorage.setItem(storageKey, JSON.stringify({ answers, areaNotes }));
    }

    function loadLocal() {
        try {
            const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
            if (parsed && typeof parsed === "object" && ("answers" in parsed || "areaNotes" in parsed)) {
                return {
                    answers: parsed.answers || {},
                    areaNotes: parsed.areaNotes || {}
                };
            }
            return { answers: parsed || {}, areaNotes: {} };
        } catch {
            return { answers: {}, areaNotes: {} };
        }
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    // Define which questions act as conditional gates for sections
    const conditionalSections = {
        "Employees": {
            gateQuestion: "EMP-001", // First question about employees
            skipAnswers: ["0", "N/A"], // If they answer "I do not do this" or "Not Applicable"
            skipMessage: "I don't have employees"
        },
        "Products_Services": {
            gateQuestion: "PDS-001", // First question about products/services
            skipAnswers: ["0", "N/A"],
            skipMessage: "I don't offer products or services"
        }
    };

    function isConditionalGateQuestion(question) {
        return Object.values(conditionalSections).some(section => section.gateQuestion === question.id);
    }

    function getConditionalSectionForQuestion(question) {
        return Object.entries(conditionalSections).find(([, section]) => section.gateQuestion === question.id);
    }

    function shouldSkipSection(sectionName) {
        const section = conditionalSections[sectionName];
        if (!section) return false;

        const gateAnswer = answers[section.gateQuestion];
        return section.skipAnswers.includes(gateAnswer);
    }

    function skipSectionQuestions(sectionName) {
        const sectionQuestions = data.flat.filter(q => {
            // Find questions that belong to this section
            for (const sec of data.sections) {
                if (sec.name === sectionName) {
                    return sec.items.includes(q) || (sec.noteItem && sec.noteItem === q);
                }
            }
            return false;
        });

        // Mark all questions in this section as "N/A" except the gate question
        sectionQuestions.forEach(q => {
            if (q.id !== conditionalSections[sectionName].gateQuestion && q.kind !== "area_note") {
                answers[q.id] = "N/A";
            }
        });

        saveLocal();
        computeProgress();
        renderSections();
    }

    function renderConditionalQuestion(q) {
        const [sectionName, section] = getConditionalSectionForQuestion(q);
        const entries = Object.entries(q.scoring_scale);
        const selected = answers[q.id];

        // Add special options for skipping the entire section
        const specialEntries = [...entries];
        if (!specialEntries.some(([value]) => value === "N/A")) {
            specialEntries.push(["SKIP_SECTION", section.skipMessage]);
        }

        const tiles = specialEntries
            .map(([value, label]) => {
                const isSel = selected === value || (value === "SKIP_SECTION" && shouldSkipSection(sectionName));
                const isSkipOption = value === "SKIP_SECTION";

                return `<button class="tile ${isSel ? "selected" : ""} ${isSkipOption ? "skip-option" : ""}"
                                data-value="${value}"
                                data-section="${isSkipOption ? sectionName : ''}"
                                aria-pressed="${isSel}">
                    ${label}
                    ${isSkipOption ? '<div class="skip-explanation">This will mark all questions in this section as "Not Applicable"</div>' : ''}
                </button>`;
            })
            .join("");

        questionArea.innerHTML = `
            <article class="question-card" data-qid="${q.id}">
                <div class="question-text">${q.question}</div>
                <div class="section-info">This question determines if the ${cleanAreaName(sectionName)} section applies to your business.</div>
                <div class="tile-grid" role="group" aria-label="Answer choices for ${q.id}">
                    ${tiles}
                </div>
            </article>
        `;

        questionArea.querySelectorAll(".tile").forEach((btn) => {
            btn.addEventListener("click", () => {
                const val = btn.getAttribute("data-value");
                const sectionToSkip = btn.getAttribute("data-section");

                if (val === "SKIP_SECTION") {
                    // Set the gate question to "N/A" and skip the section
                    answers[q.id] = "N/A";
                    skipSectionQuestions(sectionToSkip);
                } else {
                    answers[q.id] = val;

                    // If they chose a non-skip answer, clear any "N/A" answers in this section
                    if (!section.skipAnswers.includes(val)) {
                        clearSectionSkip(sectionName);
                    } else {
                        // If they chose a skip answer, skip the section
                        skipSectionQuestions(sectionName);
                    }
                }

                console.log("Conditional answer saved:", q.id, "=", answers[q.id]);
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
                    updateUI();
                }
            });
        });
    }

    function clearSectionSkip(sectionName) {
        const sectionQuestions = data.flat.filter(q => {
            for (const sec of data.sections) {
                if (sec.name === sectionName) {
                    return sec.items.includes(q);
                }
            }
            return false;
        });

        // Remove "N/A" answers from this section (except the gate question)
        sectionQuestions.forEach(q => {
            if (q.id !== conditionalSections[sectionName].gateQuestion && answers[q.id] === "N/A") {
                delete answers[q.id];
            }
        });
    }

    function computeProgress() {
        const total = data.flat.filter((q) => q.id !== "CATALYST-001" && q.kind !== "area_note").length;
        const done = Object.keys(answers).filter(id => id !== "CATALYST-001").length;
        const pct = total ? Math.round((done / total) * 100) : 0;

        // Debug logging
        console.log("Progress Debug:", {
            totalQuestions: data.flat.length,
            totalExcludingCatalyst: total,
            answeredExcludingCatalyst: done,
            allAnswers: Object.keys(answers),
            percentage: pct
        });

        progressBar.style.width = pct + "%";
        progressLabel.textContent = `${pct}% complete`;
    }

    function cleanAreaName(name) {
        return name.replace('Customers_Marketing', 'Customers & Marketing').replace('Products_Services', 'Products & Services');
    }

    function buildAreaNoteQuestion(areaName) {
        return {
            id: `NOTE-${areaName}`,
            type: "Area Note",
            kind: "area_note",
            areaName,
            question: areaNotePrompts[areaName] || "",
            helperText: areaNoteIntro
        };
    }

    function renderSections() {
        sectionList.innerHTML = "";
        data.sections.forEach((sec) => {
            const doneInSec = sec.items.filter((q) => answers[q.id] !== undefined).length;
            const pill = document.createElement("button");

            // Check if this section is skipped
            const isSkipped = shouldSkipSection(sec.name);
            const skippedClass = isSkipped ? " skipped" : "";

            pill.className = "section-pill" + (sec.containsIndex(currentIndex) ? " active" : "") + skippedClass;
            pill.type = "button";

            // Exclude catalyst section from showing counts
            let displayCount = "";
            if (sec.name !== "Assessment Focus") {
                if (isSkipped) {
                    displayCount = `<span class="count skipped-count">Skipped</span>`;
                } else {
                    displayCount = `<span class="count">${doneInSec}/${sec.items.length}</span>`;
                }
            }

            const cleanName = cleanAreaName(sec.name);
            pill.innerHTML = `<span>${cleanName}</span>${displayCount}`;
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
            const catalyst = answers["CATALYST-001"] || "Steady Growth";

            // Prepare answers in the format needed for the PDF
            const formattedAnswers = Object.entries(answers)
                .filter(([question_id, value]) => question_id !== "CATALYST-001" && value !== "N/A")
                .map(([question_id, value]) => ({
                    question_id: question_id,
                    score: parseInt(value, 10)
                }));
            const formattedAreaNotes = Object.fromEntries(
                Object.entries(areaNotes)
                    .map(([area, note]) => [area, note.trim()])
                    .filter(([, note]) => note)
            );
            
            const pdfData = {
                catalyst: catalyst,
                overall_score: lastAssessmentResult.overall_score,
                overall_tier: lastAssessmentResult.overall_tier,
                priority_categories: lastAssessmentResult.priority_categories,
                category_scores: lastAssessmentResult.category_scores,
                category_details: lastAssessmentResult.category_details,
                recommendations: lastAssessmentResult.recommendations,
                answers: formattedAnswers,
                area_notes: formattedAreaNotes
            };

            const response = await fetch("export-pdf", {
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

        if (q.kind === "area_note") {
            const existingNote = areaNotes[q.areaName] || "";
            questionArea.innerHTML = `
                <article class="question-card question-card--note" data-qid="${q.id}">
                    <div class="question-text">${cleanAreaName(q.areaName)}</div>
                    <p class="note-intro">${q.helperText}</p>
                    <label class="note-label" for="${q.id}">${q.question}</label>
                    <textarea id="${q.id}" class="area-note-input" placeholder="Type here if you'd like to share more context..." rows="7">${existingNote}</textarea>
                </article>
            `;

            const textarea = questionArea.querySelector(".area-note-input");
            textarea.addEventListener("input", () => {
                const trimmed = textarea.value.trim();
                if (trimmed) {
                    areaNotes[q.areaName] = textarea.value;
                } else {
                    delete areaNotes[q.areaName];
                }
                saveLocal();
            });
            return;
        }

        // Check if this is a conditional section gate question
        if (isConditionalGateQuestion(q)) {
            renderConditionalQuestion(q);
            return;
        }

        // Check if this question belongs to a skipped section
        const questionSection = data.sections.find(sec => sec.items.includes(q));
        if (questionSection && shouldSkipSection(questionSection.name)) {
            // This question is in a skipped section, auto-answer and move on
            if (answers[q.id] !== "N/A") {
                answers[q.id] = "N/A";
                saveLocal();
            }

            // Skip to next question
            if (currentIndex < data.flat.length - 1) {
                currentIndex += 1;
                updateUI();
            } else {
                updateUI();
            }
            return;
        }

        const entries = Object.entries(q.scoring_scale);
        const selected = answers[q.id];

        const tiles = entries
            .map(([value, label]) => {
                const isSel = selected === value;
                const isCatalyst = q.id === "CATALYST-001";
                let desc = "";
                if (isCatalyst && assessmentFocusDefinitions[label]) {
                    desc = `<p style="font-size:12px;color:#666;margin-top:4px;">${assessmentFocusDefinitions[label]}</p>`;
                }

                return `<button class="tile ${isSel ? "selected" : ""}" data-value="${value}" aria-pressed="${isSel}">
                    ${label}
                    ${desc}
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
                console.log("Answer saved:", q.id, "=", val, "Total answers:", Object.keys(answers));
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
                    updateUI(); // Update everything including section counts
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
            areaNotes = {};
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
                    Request SBDC Consultation
                </button>

                <button id="viewResources" type="button">
                    View More Resources
                </button>
                
            </div>

            <div class="result-block">
                <h3>Recommendations</h3>
                ${recommendationsHTML}
            </div>
        `;

        document.getElementById("downloadPdfBtn").addEventListener("click", downloadPDF);
        document.getElementById("bookCall").addEventListener("click", () => {
            window.open("https://sbdc.wisc.edu/about-us/free-small-business-consulting/", "_blank");
        });
        document.getElementById("viewResources").addEventListener("click", () => {
            window.open("https://sbdc.wisc.edu/resources/", "_blank");
        });
    }

    function showLoadingScreen() {
        let loading = document.getElementById("loadingScreen");
        if (!loading) {
            loading = document.createElement("div");
            loading.id = "loadingScreen";
            loading.innerHTML = `
                <div class="loading-inner">
                    <div class="loading-logo">
                        <img src="image 2.png" alt="SBDC logo" style="max-width:260px; margin-bottom:24px;">
                    </div>
                    <div class="loading-spinner">
                        <div class="spinner-ring"></div>
                        <div class="spinner-ring spinner-ring--delay1"></div>
                        <div class="spinner-ring spinner-ring--delay2"></div>
                    </div>
                    <p class="loading-headline">Analyzing your responses…</p>
                    <p class="loading-sub" id="loadingSubtext">Building your personalized business report</p>
                </div>
            `;
            document.body.appendChild(loading);
        }
        loading.classList.add("visible");

        // Cycle through messages
        const messages = [
            "Building your personalized business report",
            "Identifying priority areas for improvement",
            "Crafting tailored recommendations",
            "Almost ready…"
        ];
        let msgIndex = 0;
        const subEl = document.getElementById("loadingSubtext");
        loading._msgInterval = setInterval(() => {
            msgIndex = (msgIndex + 1) % messages.length;
            if (subEl) subEl.textContent = messages[msgIndex];
        }, 3000);
    }

    function hideLoadingScreen() {
        const loading = document.getElementById("loadingScreen");
        if (loading) {
            clearInterval(loading._msgInterval);
            loading.classList.remove("visible");
        }
    }

    submitBtn.addEventListener("click", async () => {
        submitStatus.textContent = "Submitting…";
        submitBtn.disabled = true;
        showLoadingScreen();

        try {
            const filteredAnswers = Object.entries(answers)
                .filter(([question_id, value]) => value !== "N/A" && question_id !== "CATALYST-001")
                .map(([question_id, value]) => ({
                    question_id,
                    score: parseInt(value, 10),
                    notes: null
                }));
            const filteredAreaNotes = Object.fromEntries(
                Object.entries(areaNotes)
                    .map(([area, note]) => [area, note.trim()])
                    .filter(([, note]) => note)
            );

            const payload = {
                catalyst: answers["CATALYST-001"] || "Steady Growth",
                answers: filteredAnswers,
                area_notes: filteredAreaNotes
            };

            const res = await fetch(cfg.submitUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const out = await res.json().catch(() => ({}));

            submitStatus.textContent = "Saved ✓";
            hideLoadingScreen();
            showResults(out);

        } catch (err) {
            console.error(err);
            hideLoadingScreen();
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
            const [questions, functionalAreas] = await Promise.all([
                fetchJSON(cfg.dataPaths.questions),
                fetchJSON(cfg.dataPaths.functionalAreas)
            ]);

            // Create catalyst question as the first question
            const catalystQuestion = {
                id: "CATALYST-001",
                question: "What best describes the current driving force behind your business assessment needs?",
                type: "Catalyst Selection",
                scoring_scale: {
                    "Economic Uncertainty": "Economic Uncertainty",
                    "Crisis": "Crisis or Setback",
                    "New Opportunity": "New Opportunity",
                    "Steady Growth": "Steady Growth",
                    "Lifestyle Change": "Lifestyle Change",
                    "Operational Adjustments": "Operational Adjustments"
                }
            };

            const sections = [{
                name: "Assessment Focus",
                items: [catalystQuestion],
                containsIndex: (idx) => idx === 0
            }];

            Object.keys(questions.assessment).forEach((name) => {
                sections.push({
                    name,
                    items: questions.assessment[name],
                    noteItem: buildAreaNoteQuestion(name),
                    containsIndex: () => false
                });
            });

            const flat = [];
            sections.forEach((sec) => {
                sec.items.forEach((q) => flat.push(q));
                if (sec.noteItem) {
                    flat.push(sec.noteItem);
                }
            });
            flat.forEach((q, i) => indexById.set(q.id, i));

            sections.forEach((sec) => {
                if (sec.name === "Assessment Focus") return;
                const firstIdx = indexById.get(sec.items[0]?.id);
                const lastIdx = indexById.get(sec.noteItem?.id ?? sec.items[sec.items.length - 1]?.id);
                sec.containsIndex = (idx) => idx >= firstIdx && idx <= lastIdx;
            });

            data.sections = sections;
            data.flat = flat;

            const savedState = loadLocal();
            answers = savedState.answers;
            areaNotes = savedState.areaNotes;

            // Set default catalyst answer if not already set
            if (!answers["CATALYST-001"]) {
                answers["CATALYST-001"] = "Steady Growth";
            }

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
