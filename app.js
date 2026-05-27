(function () {
    const cfg = window.APP_CONFIG;

    const data = { sections: [], flat: [] };
    const indexById = new Map();
    let currentIndex = 0;
    let answers = {};
    let areaNotes = {};
    let skippedSections = {};
    let prefilled = null;
    let lastAssessmentResult = null; 
    let lastAssessmentPayload = null;
    let fullRecommendationsLoading = false;
    const lastVisitedIndexBySection = {};
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
    const resetModal = document.getElementById("resetModal");
    const cancelResetBtn = document.getElementById("cancelResetBtn");
    const confirmResetBtn = document.getElementById("confirmResetBtn");

    const storageKey = "assessment_answers_v1";

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function sanitizeUserTextInput(value) {
        const input = String(value ?? "").replace(/\0/g, "");
        if (window.DOMPurify) {
            return window.DOMPurify.sanitize(input, {
                ALLOWED_TAGS: [],
                ALLOWED_ATTR: []
            }).trim();
        }
        return input.trim();
    }

    function sanitizeLLMHtml(markdown) {
    const rendered = window.marked
        ? marked.parse(String(markdown ?? ""))
        : escapeHTML(String(markdown ?? ""));

    if (window.DOMPurify) {
        return window.DOMPurify.sanitize(rendered, {
            ALLOWED_TAGS: ["p", "ul", "ol", "li", "strong", "em", "br", "a", "code", "pre", "blockquote"],
            ALLOWED_ATTR: ["href", "target", "rel"],
            FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
            FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "style"]
        });
    }

    return escapeHTML(String(markdown ?? ""));
    }

    function renderRecommendationsHTML(recommendations) {
        if (Array.isArray(recommendations)) {
            return recommendations
                .map(rec => `
                    <div class="recommendation">
                        ${sanitizeLLMHtml(rec)}
                    </div>
                `)
                .join("");
        }

        if (recommendations) {
            return `
                <div class="recommendation">
                    ${sanitizeLLMHtml(recommendations)}
                </div>
            `;
        }

        return `
            <div class="recommendation recommendation-status">
                Additional recommendations are still being prepared.
            </div>
        `;
    }

    function sanitizeAreaNotesMap(notes) {
        if (!notes || typeof notes !== "object") return {};
        return Object.fromEntries(
            Object.entries(notes)
                .map(([area, note]) => [area, sanitizeUserTextInput(note)])
                .filter(([, note]) => note)
        );
    }

    function saveLocal() {
        areaNotes = sanitizeAreaNotesMap(areaNotes);
        localStorage.setItem(storageKey, JSON.stringify({ answers, areaNotes, skippedSections }));
    }

    function loadLocal() {
        try {
            const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
            if (parsed && typeof parsed === "object" && ("answers" in parsed || "areaNotes" in parsed)) {
                return {
                    answers: parsed.answers || {},
                    areaNotes: sanitizeAreaNotesMap(parsed.areaNotes || {}),
                    skippedSections: parsed.skippedSections || {}
                };
            }
            return { answers: parsed || {}, areaNotes: {}, skippedSections: {} };
        } catch {
            return { answers: {}, areaNotes: {}, skippedSections: {} };
        }
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    // Define which questions act as conditional gates for sections
    const conditionalSections = {
        "Employees": {
            gateQuestion: "EMP-000", // Employee count gate question
            skipAnswers: ["0", "N/A"], // If they answer "I do not do this" or "Not Applicable"
            skipMessage: "I don't have employees"
        }
    };

    function isConditionalGateQuestion(question) {
        return Object.values(conditionalSections).some(section => section.gateQuestion === question.id);
    }

    function getConditionalSectionForQuestion(question) {
        return Object.entries(conditionalSections).find(([, section]) => section.gateQuestion === question.id);
    }

    function shouldSkipSection(sectionName) {
        if (skippedSections[sectionName]) return true;

        const section = conditionalSections[sectionName];
        if (!section) return false;

        const gateAnswer = answers[section.gateQuestion];
        return section.skipAnswers.includes(gateAnswer);
    }

    function isSkippableSection(sectionName) {
        return sectionName && sectionName !== "Assessment Focus";
    }

    function getSectionScorableItems(sec) {
        return sec.items.filter((q) => q.id !== "CATALYST-001" && q.kind !== "area_note");
    }

    function isQuestionInSection(q, sectionName) {
        const sec = data.sections.find((section) => section.name === sectionName);
        return Boolean(sec && (sec.items.includes(q) || sec.noteItem === q));
    }

    function isAnswerInSkippedSection(questionId) {
        const q = indexById.has(questionId) ? data.flat[indexById.get(questionId)] : null;
        if (!q) return false;

        const section = getSectionForQuestion(q);
        return Boolean(section && shouldSkipSection(section.name));
    }

    function getSkippedSectionNames() {
        return data.sections
            .filter((section) => isSkippableSection(section.name) && shouldSkipSection(section.name))
            .map((section) => section.name);
    }

    function filterSkippedAreaNotes(notes) {
        const skippedNames = new Set(getSkippedSectionNames());
        return Object.fromEntries(
            Object.entries(notes).filter(([area]) => !skippedNames.has(area))
        );
    }

    function skipSectionQuestions(sectionName) {
        if (!isSkippableSection(sectionName)) return;
        skippedSections[sectionName] = true;
        delete areaNotes[sectionName];

        const sectionQuestions = data.flat.filter(q => isQuestionInSection(q, sectionName));

        // Mark all questions in this section as skipped so prior answers are not scored.
        sectionQuestions.forEach(q => {
            if (q.id !== conditionalSections[sectionName]?.gateQuestion && q.kind !== "area_note") {
                answers[q.id] = "N/A";
            }
        });

        saveLocal();
        computeProgress();
        renderSections();
    }

    function getSectionEndIndex(sec) {
        const indexes = [];
        sec.items.forEach((q) => {
            if (indexById.has(q.id)) indexes.push(indexById.get(q.id));
        });
        if (sec.noteItem && indexById.has(sec.noteItem.id)) {
            indexes.push(indexById.get(sec.noteItem.id));
        }
        return indexes.length ? Math.max(...indexes) : currentIndex;
    }

    function clearSectionSkip(sectionName) {
        delete skippedSections[sectionName];
        const sectionQuestions = data.flat.filter(q => {
            for (const sec of data.sections) {
                if (sec.name === sectionName) {
                    return sec.items.includes(q);
                }
            }
            return false;
        });

        // Remove skipped placeholders when a user reopens a section.
        sectionQuestions.forEach(q => {
            if (q.id !== conditionalSections[sectionName]?.gateQuestion && answers[q.id] === "N/A") {
                delete answers[q.id];
            }
        });

        saveLocal();
    }

    function reopenSection(sectionName) {
        const sec = data.sections.find((section) => section.name === sectionName);
        if (!sec) return;
        clearSectionSkip(sectionName);
        currentIndex = getSectionStartIndex(sec);
        updateUI();
    }

    function renderSkippedSection(sectionName) {
        const sec = data.sections.find((section) => section.name === sectionName);
        if (!sec) return;

        questionArea.classList.remove("hidden");
        document.getElementById("results").classList.add("hidden");
        questionArea.innerHTML = `
            <article class="question-card skipped-section-card">
                <div class="section-kicker">${escapeHTML(cleanAreaName(sectionName))}</div>
                <div class="question-text">This section has been skipped.</div>
                <div class="section-actions">
                    <button id="reopenSectionBtn" class="btn primary" type="button">Answer this section</button>
                    <button id="nextSectionBtn" class="btn" type="button">Go to next section</button>
                </div>
            </article>
        `;

        document.getElementById("reopenSectionBtn").addEventListener("click", () => reopenSection(sectionName));
        document.getElementById("nextSectionBtn").addEventListener("click", () => {
            currentIndex = getNextSectionIndex(sectionName);
            updateUI();
        });
    }

    function getNextSectionIndex(sectionName) {
        const sec = data.sections.find((section) => section.name === sectionName);
        if (!sec) return currentIndex;
        const nextIndex = getSectionEndIndex(sec) + 1;
        if (nextIndex >= data.flat.length) {
            return findNavigableIndex(getSectionStartIndex(sec) - 1, -1);
        }
        return findNavigableIndex(nextIndex, 1);
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

                return `<button class="tile ${isSel ? "selected" : ""}"
                                data-value="${escapeHTML(value)}"
                                data-section="${value === "SKIP_SECTION" ? escapeHTML(sectionName) : ""}"
                                aria-pressed="${isSel}">
                    ${escapeHTML(label)}
                </button>`;
            })
            .join("");

        questionArea.innerHTML = `
            <article class="question-card" data-qid="${q.id}">
                <div class="question-text">${escapeHTML(q.question)}</div>
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

    function computeProgress() {
        const total = data.flat.filter((q) =>
            q.id !== "CATALYST-001" &&
            q.kind !== "area_note" &&
            !isQuestionHiddenBySkip(q)
        ).length;
        const done = Object.entries(answers).filter(([id, value]) => {
            const q = indexById.has(id) ? data.flat[indexById.get(id)] : null;
            return id !== "CATALYST-001" && value !== "N/A" && q && !isQuestionHiddenBySkip(q);
        }).length;
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

    function getSectionForQuestion(q) {
        return data.sections.find(sec => sec.items.includes(q) || sec.noteItem === q);
    }

    function isQuestionHiddenBySkip(q) {
        const questionSection = getSectionForQuestion(q);
        return Boolean(questionSection && shouldSkipSection(questionSection.name));
    }

    function findNavigableIndex(startIndex, direction) {
        let idx = startIndex;

        while (idx >= 0 && idx < data.flat.length) {
            const q = data.flat[idx];
            if (!isQuestionHiddenBySkip(q)) {
                return idx;
            }
            idx += direction;
        }

        return clamp(startIndex, 0, data.flat.length - 1);
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

    function rememberCurrentSectionIndex() {
        const q = data.flat[currentIndex];
        const section = q ? getSectionForQuestion(q) : null;
        if (section) {
            lastVisitedIndexBySection[section.name] = currentIndex;
        }
    }

    function getSectionStartIndex(sec) {
        const rememberedIndex = lastVisitedIndexBySection[sec.name];
        if (
            Number.isInteger(rememberedIndex) &&
            sec.containsIndex(rememberedIndex) &&
            !isQuestionHiddenBySkip(data.flat[rememberedIndex])
        ) {
            return rememberedIndex;
        }

        return indexById.get(sec.items[0].id);
    }

    function renderSections() {
        sectionList.innerHTML = "";
        data.sections.forEach((sec) => {
            const scorableItems = getSectionScorableItems(sec);
            const doneInSec = scorableItems.filter((q) => answers[q.id] !== undefined && answers[q.id] !== "N/A").length;
            const pill = document.createElement("button");

            // Check if this section is skipped
            const isSkipped = shouldSkipSection(sec.name);
            const skippedClass = isSkipped ? " skipped" : "";
            const isActive = sec.containsIndex(currentIndex);

            pill.className = "section-pill" + (isActive ? " active" : "") + skippedClass;
            pill.type = "button";

            // Exclude catalyst section from showing counts
            let displayCount = "";
            if (sec.name !== "Assessment Focus") {
                if (isSkipped) {
                    displayCount = `<span class="count skipped-count">Skipped</span>`;
                } else if (doneInSec === 0) {
                    displayCount = `<span class="count">Not started</span>`;
                } else if (doneInSec >= scorableItems.length) {
                    displayCount = `<span class="count">Complete</span>`;
                } else {
                    displayCount = `<span class="count">${doneInSec}/${scorableItems.length}</span>`;
                }
            }

            const cleanName = escapeHTML(cleanAreaName(sec.name));
            pill.innerHTML = `<span>${cleanName}</span>${displayCount}`;
            pill.addEventListener("click", () => {
                if (isSkipped) {
                    renderSkippedSection(sec.name);
                } else {
                    currentIndex = getSectionStartIndex(sec);
                    updateUI();
                }
            });
            sectionList.appendChild(pill);
        });
    }

    async function downloadPDF() {
        if (!lastAssessmentResult) {
            alert("No assessment results available. Please complete and submit the assessment first.");
            return;
        }
        if (fullRecommendationsLoading || !lastAssessmentResult.recommendations) {
            alert("Additional recommendations are still being generated. Please try again in a moment.");
            return;
        }

        try {
            const catalyst = answers["CATALYST-001"] || "Steady Growth";

            // Prepare answers in the format needed for the PDF
            const formattedAnswers = Object.entries(answers)
                .filter(([question_id, value]) =>
                    question_id !== "CATALYST-001" &&
                    value !== "N/A" &&
                    !isAnswerInSkippedSection(question_id)
                )
                .map(([question_id, value]) => ({
                    question_id: question_id,
                    score: parseInt(value, 10)
                }));
            const formattedAreaNotes = Object.fromEntries(
                Object.entries(filterSkippedAreaNotes(areaNotes))
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
                priority_recommendations: lastAssessmentResult.priority_recommendations || [],
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

    function setFullRecommendationsLoading(isLoading) {
        fullRecommendationsLoading = isLoading;

        const downloadBtn = document.getElementById("downloadPdfBtn");
        const showFullBtn = document.getElementById("showFullRecommendations");
        const fullRecommendations = document.getElementById("fullRecommendations");

        if (downloadBtn) {
            downloadBtn.disabled = isLoading;
            downloadBtn.textContent = isLoading ? "Generating PDF Content..." : "Download PDF Results";
        }

        if (showFullBtn) {
            showFullBtn.disabled = isLoading;
            showFullBtn.textContent = isLoading ? "Generating Additional Recommendations..." : "See Additional Recommendations";
        }

        if (fullRecommendations && isLoading) {
            fullRecommendations.innerHTML = `
                <h3>Additional Recommendations</h3>
                <div class="recommendation recommendation-status">
                    Additional recommendations are being generated.
                </div>
            `;
        }
    }

    async function loadFullRecommendations() {
        if (!lastAssessmentPayload) return;

        setFullRecommendationsLoading(true);

        try {
            const response = await fetch("recommendations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(lastAssessmentPayload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const out = await response.json().catch(() => ({}));
            lastAssessmentResult.recommendations = out.recommendations || "";

            const fullRecommendations = document.getElementById("fullRecommendations");
            if (fullRecommendations) {
                fullRecommendations.innerHTML = `
                    <h3>Additional Recommendations</h3>
                    ${renderRecommendationsHTML(lastAssessmentResult.recommendations)}
                `;
            }
        } catch (err) {
            console.error("Failed to load full recommendations:", err);
            lastAssessmentResult.recommendations = "";

            const fullRecommendations = document.getElementById("fullRecommendations");
            if (fullRecommendations) {
                fullRecommendations.innerHTML = `
                    <h3>Additional Recommendations</h3>
                    <div class="recommendation recommendation-status">
                        Additional recommendations could not be generated. Please try submitting again.
                    </div>
                `;
            }
        } finally {
            setFullRecommendationsLoading(false);
        }
    }

    function renderSectionControls(q) {
        const sec = getSectionForQuestion(q);
        if (!sec || !isSkippableSection(sec.name) || shouldSkipSection(sec.name)) {
            return "";
        }

        return `
            <div class="section-control-bar">
                <p>If this area does not apply to your business right now, you can skip it. You can also leave any question unanswered and move on. Skipped sections will not be included in your final recommendations.</p>
                <button class="btn ghost skip-section-btn" type="button" data-section="${escapeHTML(sec.name)}">Skip section</button>
            </div>
        `;
    }

    function bindSectionControls() {
        const skipButton = questionArea.querySelector(".skip-section-btn");
        if (!skipButton) return;

        skipButton.addEventListener("click", () => {
            const sectionName = skipButton.getAttribute("data-section");
            if (!sectionName) return;

            skipSectionQuestions(sectionName);
            renderSkippedSection(sectionName);
        });
    }

    function renderQuestion() {
        const q = data.flat[currentIndex];
        if (!q) {
            questionArea.innerHTML = '<div class="loading">No questions found.</div>';
            return;
        }

        rememberCurrentSectionIndex();

        // Check if this question belongs to a skipped section, including area notes
        if (isQuestionHiddenBySkip(q)) {
            // This question is in a skipped section, auto-answer and move on
            if (q.kind !== "area_note" && answers[q.id] !== "N/A") {
                answers[q.id] = "N/A";
                saveLocal();
            }

            const skippedSection = getSectionForQuestion(q);
            if (skippedSection) {
                renderSkippedSection(skippedSection.name);
            } else {
                currentIndex = findNavigableIndex(currentIndex + 1, 1);
                updateUI();
            }
            return;
        }

        if (q.kind === "area_note") {
            const existingNote = areaNotes[q.areaName] || "";
            questionArea.innerHTML = `
                <article class="question-card question-card--note" data-qid="${q.id}">
                    ${renderSectionControls(q)}
                    <div class="question-text">${escapeHTML(cleanAreaName(q.areaName))}</div>
                    <p class="note-intro">${escapeHTML(q.helperText)}</p>
                    <label class="note-label" for="${q.id}">${escapeHTML(q.question)}</label>
                    <textarea id="${q.id}" class="area-note-input" placeholder="Type here if you'd like to share more context..." rows="7"></textarea>
                    <p class="privacy-disclaimer" style="font-size: 12px; color: #666; margin-top: 8px; font-style: italic;">We do not collect or store personal data. Please avoid entering personal details such as names, addresses, phone numbers, or other sensitive information.</p>
                </article>
            `;
            bindSectionControls();

            const textarea = questionArea.querySelector(".area-note-input");
            textarea.value = existingNote;
            textarea.addEventListener("input", () => {
                const sanitizedNote = sanitizeUserTextInput(textarea.value);
                const trimmed = sanitizedNote.trim();
                if (trimmed) {
                    areaNotes[q.areaName] = sanitizedNote;
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

        const entries = Object.entries(q.scoring_scale);
        const selected = answers[q.id];

        const tiles = entries
            .map(([value, label]) => {
                const isSel = selected === value;
                const isCatalyst = q.id === "CATALYST-001";
                let desc = "";
                if (isCatalyst && assessmentFocusDefinitions[label]) {
                    desc = `<p style="font-size:12px;color:#666;margin-top:4px;">${escapeHTML(assessmentFocusDefinitions[label])}</p>`;
                }

                return `<button class="tile ${isSel ? "selected" : ""}" data-value="${escapeHTML(value)}" aria-pressed="${isSel}">
                    ${escapeHTML(label)}
                    ${desc}
                </button>`;
            })
            .join("");

        questionArea.innerHTML = `
            <article class="question-card" data-qid="${q.id}">
                ${renderSectionControls(q)}
                <div class="question-text">${escapeHTML(q.question)}</div>
                <div class="tile-grid" role="group" aria-label="Answer choices for ${q.id}">
                    ${tiles}
                </div>
            </article>
        `;
        bindSectionControls();

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
        prevBtn.disabled = currentIndex <= 0 || findNavigableIndex(currentIndex - 1, -1) === currentIndex;
        nextBtn.disabled = currentIndex >= data.flat.length - 1 || findNavigableIndex(currentIndex + 1, 1) === currentIndex;
    }

    function updateUI() {
        computeProgress();
        renderSections();
        renderQuestion();
        updateNavButtons();
    }

    prevBtn.addEventListener("click", () => {
        currentIndex = findNavigableIndex(currentIndex - 1, -1);
        updateUI();
    });

    nextBtn.addEventListener("click", () => {
        currentIndex = findNavigableIndex(currentIndex + 1, 1);
        updateUI();
    });

    function openResetModal() {
        resetModal.hidden = false;
        confirmResetBtn.focus();
    }

    function closeResetModal() {
        resetModal.hidden = true;
        resetBtn.focus();
    }

    function restartAssessment() {
        answers = {};
        areaNotes = {};
        skippedSections = {};
        Object.keys(lastVisitedIndexBySection).forEach((sectionName) => {
            delete lastVisitedIndexBySection[sectionName];
        });
        saveLocal();
        lastAssessmentResult = null;

        setAssessmentDisabled(false);
        questionArea.classList.remove("hidden");
        document.getElementById("results").classList.add("hidden");

        closeResetModal();
        updateUI();
    }

    resetBtn.addEventListener("click", openResetModal);
    cancelResetBtn.addEventListener("click", closeResetModal);
    confirmResetBtn.addEventListener("click", restartAssessment);
    resetModal.addEventListener("click", (event) => {
        if (event.target === resetModal) {
            closeResetModal();
        }
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !resetModal.hidden) {
            closeResetModal();
        }
    });

    function setAssessmentDisabled(disabled) {
        prevBtn.disabled = disabled;
        nextBtn.disabled = disabled;
        submitBtn.disabled = disabled;
    
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

        const skippedNames = Object.keys(skippedSections)
            .filter((name) => skippedSections[name])
            .map(cleanAreaName);
        const skippedNotice = skippedNames.length
            ? `<p class="recommendations-intro">Some sections were skipped and were not included in your recommendations: ${escapeHTML(skippedNames.join(", "))}.</p>`
            : "";

        const priorityItems = Array.isArray(out.priority_recommendations)
            ? out.priority_recommendations.slice(0, 3)
            : [];
        const priorityHTML = priorityItems.length
            ? priorityItems.map(item => `
                <article class="priority-card priority-card--${escapeHTML(item.type || "key_area")}">
                    <div class="priority-label">${escapeHTML(item.label || "Key Area to Consider")}</div>
                    <h4>${escapeHTML(item.title || "")}</h4>
                    <div class="priority-section">
                        <p>${escapeHTML(item.summary || item.what_to_do || "")}</p>
                    </div>
                    <p class="priority-step"><strong>First step:</strong> ${escapeHTML(item.first_step || "")}</p>
                </article>
            `).join("")
            : `
                <article class="priority-card">
                    <div class="priority-label">Key Area to Consider</div>
                    <h4>Report Review Starter</h4>
                    <div class="priority-section">
                        <p>Start with the full recommendations and look for the section that feels most connected to your current business decision.</p>
                    </div>
                    <p class="priority-step"><strong>First step:</strong> Note one recommendation you want to act on this week.</p>
                </article>
            `;

        resultsEl.innerHTML = `
        <h2 style="text-align: center;">
            Next Steps to Move Your Business Forward
        </h2>
    
        <div class="action-buttons"
             style="display: flex; justify-content: center; gap: 12px; margin: 16px 0;">
            
            <button id="downloadPdfBtn" type="button">
                Generating PDF Content...
            </button>
    
            <button id="bookCall" type="button">
                Request SBDC Consultation
            </button>
    
            <button id="viewResources" type="button">
                View More Resources
            </button>
            
        </div>
    
        <section class="result-block priority-block">
            <p class="recommendations-intro">
                In our many years of working with small businesses, we know that planning for your business' future can feel overwhelming or hard to prioritize.
            </p>
            <p class="recommendations-intro">
                Below, you'll find three recommendations. These include two key areas to consider - based on what you indicated as your business strengths, challenges, and reason for planning - and one "quick win" that should help you take a step in the right direction quickly. These recommendations are meant to highlight possible next steps for your own planning and/or areas to discuss with your SBDC Consultant so they can best support you.
            </p>
            <p class="recommendations-intro">
                If these suggestions aren't a fit, or they are not something you can work on right now, click "See Additional Recommendations" for more ideas to consider.
            </p>
            <p class="recommendations-intro">
                Your recommendations are based only on the sections you completed.
            </p>
            ${skippedNotice}
            <div class="priority-grid">
                ${priorityHTML}
            </div>
            <button id="showFullRecommendations" class="btn primary" type="button" disabled>
                Generating Additional Recommendations...
            </button>
        </section>

        <section id="fullRecommendations" class="result-block full-recommendations hidden">
            <h3>Additional Recommendations</h3>
            <div class="recommendation recommendation-status">
                Additional recommendations are being generated.
            </div>
        </section>
    `;

        document.getElementById("downloadPdfBtn").addEventListener("click", downloadPDF);
        document.getElementById("showFullRecommendations").addEventListener("click", () => {
            const fullRecommendations = document.getElementById("fullRecommendations");
            fullRecommendations.classList.remove("hidden");
            document.getElementById("showFullRecommendations").hidden = true;
            fullRecommendations.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        document.getElementById("bookCall").addEventListener("click", () => {
            window.open("https://sbdc.wisc.edu/about-us/free-small-business-consulting/", "_blank");
        });
        document.getElementById("viewResources").addEventListener("click", () => {
            window.open("https://sbdc.wisc.edu/resources/", "_blank");
        });

        setFullRecommendationsLoading(true);
        loadFullRecommendations();
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
                .filter(([question_id, value]) =>
                    value !== "N/A" &&
                    question_id !== "CATALYST-001" &&
                    !isAnswerInSkippedSection(question_id)
                )
                .map(([question_id, value]) => ({
                    question_id,
                    score: parseInt(value, 10),
                    notes: null
                }));
            const filteredAreaNotes = filterSkippedAreaNotes(sanitizeAreaNotesMap(areaNotes));
            const skippedSectionNames = getSkippedSectionNames();

            const payload = {
                catalyst: answers["CATALYST-001"] || "Steady Growth",
                answers: filteredAnswers,
                area_notes: filteredAreaNotes,
                skipped_sections: skippedSectionNames
            };
            lastAssessmentPayload = payload;

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
            submitBtn.disabled = Boolean(lastAssessmentResult);
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

            const employeeGateQuestion = questions.assessment.Employees.find((q) => q.id === "EMP-000");
            const productsGateQuestion = questions.assessment.Products_Services.find((q) => q.id === "PDS-000");

            const assessmentFocusItems = [catalystQuestion, employeeGateQuestion, productsGateQuestion].filter(Boolean);

            const sections = [{
                name: "Assessment Focus",
                items: assessmentFocusItems,
                containsIndex: (idx) => idx >= 0 && idx < assessmentFocusItems.length
            }];

            Object.keys(questions.assessment).forEach((name) => {
                const sectionItems = questions.assessment[name].filter((q) => {
                    if (name === "Employees") return q.id !== "EMP-000";
                    if (name === "Products_Services") return q.id !== "PDS-000";
                    return true;
                });

                sections.push({
                    name,
                    items: sectionItems,
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
            areaNotes = sanitizeAreaNotesMap(savedState.areaNotes);
            skippedSections = savedState.skippedSections || {};

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
