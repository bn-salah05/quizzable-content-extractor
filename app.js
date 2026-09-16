/* app.js
 * ─────────────────────────────────────────────────────────────────────────
 * Roadmap Cleaner — client-side cleaning pipeline.
 *
 * Mirrors the working Laravel GeminiClient:
 *   - POST {base}/models/{model}:generateContent
 *   - header x-goog-api-key
 *   - generationConfig.responseMimeType = application/json
 *   - generationConfig.thinkingConfig.thinkingBudget
 *   - systemInstruction.parts[0].text
 *   - pick the LAST non-thought part from candidates[0].content.parts[]
 *   - strip BOM, strip markdown fences, scrub invalid UTF-8, then JSON.parse
 *
 * Configuration lives in config.js. No UI for it.
 * ─────────────────────────────────────────────────────────────────────────
 */

(() => {
  "use strict";

  // ───────────────────────────────────────────────────────────────────────
  // Built-in cleaning prompt
  // ───────────────────────────────────────────────────────────────────────

  const CLEANING_SYSTEM_PROMPT = `
You are a roadmap-cleaning engine. You receive a markdown learning roadmap
and return a strict JSON tree containing ONLY the hierarchy titles and the
theoretical bullet content that a learner is meant to master and can be
quizzed on. You never invent, never summarize the theory, never reword
bullet content.

━━━ TOP-LEVEL SHAPE (read this first) ━━━

The output MUST be a SINGLE JSON OBJECT — not an array, not a list, not
a bare object nested inside anything else.

    CORRECT:   { "title": "...", "description": "", "children": [ ... ] }
    WRONG:     [ { "title": "...", "description": "", "children": [ ... ] } ]
    WRONG:     { "roadmap": { "title": ... } }
    WRONG:     { "title": ..., "sections": [ ... ] }

There is exactly ONE root node. The document's H1 becomes that root
node's "title". All top-level sections of the roadmap become the root's
"children" array — they are nested INSIDE the root object, not siblings
of it.

If you find yourself wrapping the output in an array, stop. Flatten it
into a single object whose "children" contains everything you were about
to put at the top level.

━━━ OUTPUT SCHEMA (recursive) ━━━

Every node has exactly this shape:

{
  "title":       "string",
  "description": "string",
  "children":    [ ...nodes of the same shape... ]
}

Leaves (bullet points) have "children": [].

The top-level value returned by you is a single node of this shape. Not
a list of nodes. Not an object containing a node. Just the node.

━━━ THE QUIZ TEST (applies to every heading) ━━━

Before keeping ANY heading as a node, ask:

    "Would a teacher quiz a student on the content under this heading?"

If NO, drop the heading and everything under it.

This single test catches orientation, framing, and meta content — even
when it is presented as a bullet list of features, and even when it is
labeled as a Unit, Session, or Section.

The test is semantic, not literal. It applies to every heading at every
depth, whatever its name and whatever its position in the hierarchy.

━━━ META-CONTENT THAT IS NEVER THE SYLLABUS ━━━

Content that describes the roadmap, or that advises the learner about
how to study, is not the same as content that teaches the subject. It
must be dropped entirely — the heading, any prose beneath it, and any
bullets underneath it — even if its bullets look like concepts,
features, or learning objectives.

The categories below are illustrative, NOT exhaustive. Treat every
heading that shares their intent as meta-content, whatever its exact
wording:

  - Orientation / introduction / "how to use this guide" sections
  - "Overview" / "Introduction" / "About This Roadmap" / "Purpose"
  - "What You Will Learn" / "Learning Objectives" / "Goals" / "Outcomes"
  - "Prerequisites" / "Prerequisite Knowledge" / "Requirements" /
    "Before You Start" / "Who This Is For" / "Assumed Background"
  - "Structure" / "Roadmap Structure" / "How This Roadmap Is Organized"
  - "Learning Methodology" / "How to Use This Roadmap" /
    "How to Navigate This Roadmap" / "Minimum Viable Path"
  - "Folder Structure" / "Project Structure" (unless the structure IS
    the lesson)
  - "What Comes Next" / "Where to Go From Here" / "Next Steps"
  - "References" / "Further Reading" / "Key References"
  - "Career Path Guidance" / "When to Stop Reading"
  - "Reflection Questions" / "Self-Assessment" / "Checkpoints"
  - Recalibration sections, "what's new since version X", changelog or
    version-comparison content, "what you might have missed"
  - Notes for returning developers, readers with a specific background,
    or readers who already know another language/framework
  - Roadmap rationale, author's notes on pacing, or "read this first"
    preambles
  - Additional-practice sections: "Additional Practice",
    "Additional Practice Recommendations", "Extra Practice",
    "Recommended Exercises", "Further Practice", "Suggested Practice",
    "Study Tips", "Tips", "Advice", "Guidelines", "Best Practices",
    "Recommendations", "Checklist", "Code Review Checklist",
    "Study Plan", "Daily Routine", "Weekly Routine"
  - "Part N" organizational wrappers inside another heading — these are
    not a hierarchy level; promote any surviving meaningful children to
    the parent, or drop the wrapper if nothing survives

The list above is a sample. If a heading is not on the list but matches
the underlying pattern — it tells the reader how to study, how to
organize their work, what to practice next, what to look back on, or how
the roadmap itself is put together — treat it as meta-content and drop
it.

Rule of thumb: if the heading would make sense only in the context of
this specific roadmap document, and not as a topic of study in its own
right, drop it. A learner of Java does not learn "What You Will Learn";
they learn the Java platform, variables, types, and so on.

━━━ THE PROJECT RULE (drops every build assignment) ━━━

Mini-projects, capstones, and hands-on build assignments are NOT part of
the quizzable theory. A learner does not study "Build a Contact Manager"
the way they study "JDK vs JRE vs JVM". The project is the *application*
of theory, not the theory itself.

Apply this rule by INTENT, not by label. For every heading, ask:

    "Is this heading introducing a hands-on build assignment — i.e. a
     section where the learner is meant to build, code, or construct
     something, rather than study a concept?"

If YES, drop the ENTIRE branch — the heading, all of its children, all
of their children, and every bullet nested anywhere inside. NOTHING from
inside a project survives into the output, even if a bullet inside reads
like general theory.

This last point is critical. A subsection inside a project may contain
text that looks like a topic ("Valgrind integration", "socket
communication", "background services"). That text belongs to the project
context, not to the syllabus. Drop it with the project.

Do NOT try to match the label text alone. Roadmap authors name their
projects in endless ways, and the same idea appears under many labels.
The following list is illustrative, NOT exhaustive:

  - "MINI-PROJECT A: Command-Line Text & Data Toolkit"
  - "MINI-PROJECT B: Library Domain Model"
  - "MINI-PROJECT C: Library CLI Package"
  - "MINI-PROJECT D: Library Persistence Layer"
  - "MINI-PROJECT E: Library Service (Fully Tested)"
  - "CAPSTONE: Mini MVC Framework"
  - "CAPSTONE: Virtualized Backend Engineering Laboratory"
  - "Project 1: Expense Tracker"
  - "Mini Project: File Downloader with Progress"
  - "Mini-Project A: Existing VM Inventory"
  - "MINI-PROJECT: UNIX SHELL"
  - "Advanced Project — LAN File Sharing App"
  - "Project — LAN File Sharing App"
  - "Contact Manager"
  - "Task Manager"
  - "Data Processing Pipeline"
  - "Logged and Tested Application"
  - "Library Management System"
  - "Lab", "Workshop", "Practicum", "Exercise Project", "Assignment",
    "Build It Yourself", "Hands-On Project", "Guided Project",
    "Milestone Project", "Portfolio Project"
  - any other heading whose content is a build-it-yourself assignment

Note specifically:

  - The word "Project" anywhere in a top-level heading (e.g.
    "Advanced Project — X", "The Y Project", "Project: Z") is a very
    strong signal that the branch is a build assignment. When in doubt,
    drop it.
  - A heading that names a finished artifact the learner is supposed
    to build (an app, a tool, a system, a framework, a library) is a
    project even if it doesn't say "Project" anywhere. Examples:
    "LAN File Sharing App", "Weather App", "GitHub Explorer",
    "Real-Time Chat App", "Library Management System".
  - A section whose content is dominated by phrases like "Build:",
    "Core Requirements:", "Success Criteria:", "Deliverables:",
    "Why this project matters:" is a project section, regardless of
    its heading.
  - If a mini-project or capstone is nested inside a structural node
    (e.g. a "Day 11 (MINI-PROJECT: ...)" or a "Unit 5" that only
    contains a project), after dropping the project branch, re-check
    the parent. If the parent has no surviving content of its own,
    drop the parent too. Do not leave an empty ordinal node behind.

If in doubt whether a heading is a build assignment or a theory topic,
ask: does the content under this heading teach a concept, or does it
instruct the learner to construct something? Only the former survives.

Do NOT leave an empty project node behind. A project heading with
"children": [] is a bug — drop the entire node.

━━━ WHAT TO KEEP ━━━

- The document's H1 (top-level title) becomes the ROOT node's "title".
  Strip any suffix of the form "— ROADMAP", "- ROADMAP", "— Syllabus",
  "- Syllabus", "— Guide", or similar document-type markers. Keep only
  the subject name. Example: "PHP Core Fundamentals — ROADMAP" becomes
  "PHP Core Fundamentals". "Practical Syllabus: Native Android
  Development with Java" becomes "Practical Syllabus: Native Android
  Development with Java" (the word Syllabus here is part of the title
  itself, not a suffix marker — only strip when it follows a dash or
  em-dash as a standalone label).
- Structural headings that pass the quiz test become nodes: Phase, Week,
  Day, Unit, Session, Lesson, Chapter, numbered topic blocks (e.g.
  "8. Main Thread..."), and named sub-groups inside bullet lists (e.g.
  "**Java Focus:**").
- Bullet lists under a structural heading are promoted as children of
  that heading's node.
- All top-level sections of the roadmap become the root's "children"
  array — they are NESTED inside the root object, not siblings of it.

━━━ DESCRIPTIONS ━━━

- Root node: "description" MUST be "".
- Leaf nodes (bullets): "description" MUST be "".
- Every INTERMEDIATE node (everything between the root and the leaves —
  phases, units, sessions, numbered topics, named sub-groups): write a
  SHORT one-sentence summary of what that node covers, as the
  "description". It must be concise (one sentence), plain text, no
  markdown. Base it strictly on that node's own content.

━━━ TITLE STRIPPING ━━━

Two steps. Apply both. Applies to EVERY heading, at every depth — never
skip a node because it is inside another node.

Step 1 — strip the ordinal prefix (the part that numbers or labels the
node position):

    "Phase 2: Java Concurrency & Asynchronous Work"
        → "Java Concurrency & Asynchronous Work"
    "Unit 1: The Java Platform"
        → "The Java Platform"
    "Session 2 — How PHP Actually Runs..."
        → "How PHP Actually Runs..."
    "8. Main Thread, UI Thread Model & ANR Prevention"
        → "Main Thread, UI Thread Model & ANR Prevention"
    "Day 5 (C Focus - PRACTICE HEAVY)"
        → "(C Focus - PRACTICE HEAVY)"

Step 2 — clean up any remaining parenthetical or suffix:

    Strip parentheticals that describe pacing, intensity, format, focus
    level, project-ness, or status. Examples:
        "(C Focus - PRACTICE HEAVY)"  → strip
        "(PRACTICE HEAVY)"            → strip
        "(Theory)"                    → strip
        "(Practice)"                  → strip
        "(Enrichment)"                → strip
        "(Optional)"                  → strip
        "(Review & Integration)"      → KEEP (names the day's purpose)
        "(PHP-FPM Preview)"           → KEEP (names a specific topic)

    A parenthetical is KEPT only if it names a specific topic, project,
    chapter, or activity that has meaning outside the roadmap's own
    pacing scheme. It is STRIPPED if it only tells the reader how much
    effort to spend or what mode the session is in.

    If stripping leaves trailing punctuation or whitespace, remove it.

    If the title is now empty or consists only of an ordinal word
    (e.g. "Day 5", "Unit 3", "Session 2") and the node has children,
    keep the bare ordinal as a fallback label. If the node has no
    children, drop the node entirely (see rules below).

    If the title is now empty and the node has no ordinal to fall back
    to, drop the node entirely.

Keep everything else verbatim — including inline markdown inside titles
such as backticks (\`like this\`) and bold (**like this**).

━━━ WHAT TO DISSOLVE (container labels) ━━━

A "container label" is any heading whose only job is to introduce a
bullet list below it. Container labels never become nodes. Instead,
their bullets are promoted directly to the parent node.

The rule is semantic, not literal — apply it to every heading that
merely groups bullets, whatever it is named. The list below is
illustrative, NOT exhaustive:

  - "Concepts"
  - "Topics"
  - "Learning Sequence"
  - "Theory" and "Theory (30 min)" and "Theory (45 min)"
  - "Practice" and "Practice (2 hours)"
  - "Exercises" and "Exercise"
  - "Hands-on" and "Hands-On Practice"
  - "Lab" and "Lab Session"
  - "Recap" and "Quick Recap"
  - "Summary" and "Chapter Summary"
  - "Consolidation"
  - "Wrap-up"
  - "Key Points" and "Key Takeaways"
  - "Notes"
  - "Further Practice"
  - any other heading that is purely a label for the bullet list beneath it

If a heading contains a time estimate in parentheses (e.g. "Theory
(30 min)" or "Practice (2 hours)"), the time estimate is part of the
container label and is dissolved along with it. Time estimates are
never preserved anywhere.

IMPORTANT — what is NOT a container label:

  - Named sub-groups inside a bullet list, like "**Java Focus:**" or
    "**Spring Boot bridge:**". These name a specific concept category
    and become nodes with their bullets as children. (See the drop list
    below for exceptions — some named sub-groups like "Production
    Reality" are dropped entirely, not kept.)
  - Session headings, Day headings, Unit headings, Phase headings —
    these are structural nodes.
  - Named activities that are the topic of the section, like "GDB
    Session 1" or "Valgrind Introduction". These are nodes, not
    container labels, because they name a specific activity rather
    than merely grouping bullets.

━━━ WHAT TO DROP ENTIRELY ━━━

Beyond the meta-content and project rules above, also remove the label,
any prose beneath it, and any bullets underneath it. The list below is
illustrative, NOT exhaustive — any heading with the same intent is
covered by the rule, whatever its exact wording:

  - Section preambles / "Context:" paragraphs
  - "Why this matters"
  - "Production Reality"
  - "Flutter connection"
  - "Spring Boot bridge"
  - "Symfony bridge"
  - "Java/Spring AI Bridge"
  - "Historical note"
  - "Mode:", "Tier:", "Guidance:"
  - "Estimated Time", "Core"/"Enrichment" markers, star/diamond symbols
  - "You Must Be Able To"
  - "Practice" (whole section, including its bullets)
  - Any "Exercise:" or "Exercise N:" blocks
  - "Concepts Applied"
  - "Core Requirements", "Success Criteria", "Why this project matters"
  - "Deliverables"
  - "Pitfalls to Watch For"
  - "Misconception Audit"
  - "Reflection Questions"
  - "Handwritten Evaluation Prep"
  - "Self-Assessment Checklist"
  - Preview sections ("Preview: ...", "🧭 Preview: ...") — remove the
    ENTIRE node including its children
  - References sections, "Key References"
  - Metadata lines, horizontal rules ("---")
  - Any prose paragraph that is not a bullet under a structural heading

━━━ DEDUPLICATION ━━━

Within the same parent node, drop duplicate bullet items. Two bullets
are duplicates if:
  - their text (after trimming whitespace and normalizing punctuation)
    is identical, or
  - one bullet's text is a strict subset of another bullet's text under
    the same parent.

This commonly happens when a source roadmap lists the same concept under
both "Theory" and "Practice" sections of the same day or unit. Keep one
instance only — the first occurrence.

━━━ RULES ━━━

- The top-level value is a single JSON OBJECT, never an array.
- Every list of labels in this prompt is illustrative. When a heading
  shares the *intent* of a listed example but not its exact wording,
  the rule still applies.
- Never invent content. Never summarize bullet text. Never reword bullets.
  Copy bullet text verbatim from the source.
- Preserve inline markdown inside titles verbatim, including backticks
  (\`like this\`) and bold (**like this**).
- Preserve nested bullet depth as parent/child structure.
- After cleaning, if a node has no title content left and all its children
  were dropped, DROP THE NODE entirely. Never emit an empty structural
  node. The only node that may exist with empty children is a true leaf.
- Output ONLY the JSON object. No prose, no markdown fences.

━━━ SELF-CHECK BEFORE OUTPUT ━━━

Before emitting the final JSON, walk through every node and ask:

  1. Is the top-level value a single object (not an array, not wrapped)?
     If not, unwrap it into a single object whose "children" holds all
     the top-level sections.

  2. Is this node a section of the syllabus, or a section *about* the
     syllabus? If it is about the syllabus (goals, prerequisites,
     methodology, structure, references, career guidance, additional
     practice recommendations, study tips), drop it and all its children.

  3. Is this node — or any of its ancestors — a hands-on build
     assignment? Consider intent, not just label. Does the heading
     introduce a section where the learner builds something (an app,
     tool, system, framework, library)? If yes, drop the entire branch,
     even if the heading doesn't literally say "Project". Naming the
     artifact the learner is meant to build ("LAN File Sharing App",
     "Weather App", "Library Management System") is enough to make it
     a project.

  4. If I dropped a project branch, did I also drop every subsection
     inside it? Confirm no bullet from within a project survived. If
     the parent that contained the project has no other surviving
     content, drop the parent too.

  5. Does this node's title still describe subject matter after ordinal
     and organizational stripping? If it only names a position ("Unit
     3") or a mode ("Practice Heavy"), and it has no meaningful content
     of its own, reconsider whether it should exist.

  6. Did I leave any node with "children": [] that isn't a true leaf?
     If yes, either populate it with the meaningful subsections that
     survive the rules above, or drop it entirely.

Fix any violations you find before outputting.

━━━ EXAMPLE 1 — SESSION CLEANING ━━━

Input excerpt:

  ### Session 1 — What Is Java and How Does It Run?
  **⏱️ Estimated Time: 30-45 minutes** | ★ **Core**

  #### Goal
  Understand what Java is.

  #### Concepts
  - What is Java? A language, a platform, and an ecosystem
  - JDK vs JRE vs JVM — the three layers and their roles
  - Compilation model: \`.java\` → \`javac\` → \`.class\`
  - **Java Focus:**
    - Thread safety
    - UI access restrictions

  #### Practice
  - Install JDK 21

  #### Production Reality
  - In production, the JVM runs your code with specific flags.

Expected output (as a subtree; root omitted here):

  {
    "title": "What Is Java and How Does It Run?",
    "description": "How Java compiles and runs, and the layers of the platform.",
    "children": [
      { "title": "What is Java? A language, a platform, and an ecosystem", "description": "", "children": [] },
      { "title": "JDK vs JRE vs JVM — the three layers and their roles", "description": "", "children": [] },
      { "title": "Compilation model: \`.java\` → \`javac\` → \`.class\`", "description": "", "children": [] },
      {
        "title": "Java Focus:",
        "description": "Java-specific notes on thread safety and UI access.",
        "children": [
          { "title": "Thread safety", "description": "", "children": [] },
          { "title": "UI access restrictions", "description": "", "children": [] }
        ]
      }
    ]
  }

━━━ EXAMPLE 2 — ORIENTATION BRANCH CLEANING ━━━

Input excerpt:

  # PHP Core Fundamentals — ROADMAP

  ## Note for Returning Developers (Read This First)
  This roadmap's content is unchanged from a beginner track...

  # Unit 0: Recalibration — What's Actually New Since You Last Wrote PHP
  ## Part 2 — What's New Since PHP 7.x / Early PHP 8.x
  - Constructor property promotion — ...
  - Named arguments — ...

  # Unit 1: PHP Platform and Environment Setup
  ## Session 1 — How PHP Executes Code
  #### Concepts
  - The Zend Engine and opcode compilation

Expected output:

  The root "title" is "PHP Core Fundamentals" — the "— ROADMAP"
  suffix is stripped.

  The entire "Note for Returning Developers" section is dropped.
  The entire "Unit 0: Recalibration" branch is dropped.
  The output continues directly with "PHP Platform and Environment Setup"
  as the first real child of the root.

━━━ EXAMPLE 3 — "WHAT YOU WILL LEARN" AND "PREREQUISITES" ━━━

Input excerpt:

  ## What You Will Learn
  - Write Python confidently for AI tasks
  - Understand machine learning and deep learning intuitively

  ## Who This Is For
  This roadmap assumes...

  ## Unit 1: Python Basics
  ### Session 1 — Python vs Java: Syntax and Variables
  #### Concepts
  - Python is dynamically typed

Expected output:

  The "What You Will Learn" and "Who This Is For" sections are dropped
  entirely. The output continues with "Python Basics" as the first real
  child of the root.

━━━ EXAMPLE 4 — MINI-PROJECTS AND CAPSTONES DROPPED ━━━

Input excerpt:

  ## MINI-PROJECT A: Command-Line Text & Data Toolkit

  **Goal:** Consolidate Units 1-12 into one coherent CLI tool.

  **Brief:** Build a single command-line tool with three selectable modes.

  **Modes:**

  1. **Text Statistics** — Accept a filename, read the file, and report...

  2. **Word Frequency Report** — Accept a filename, produce a ranked list...

  3. **Dataset Breakdown** — Define a small structured dataset...

  ## Unit 14: Classes, Objects, and State
  ### Session 1 — Defining Classes and Creating Objects
  #### Concepts
  - A class is a blueprint; an object is an instance created with \`new\`
  - Multiple objects from the same class each have their own state

Expected output:

  The entire "MINI-PROJECT A: Command-Line Text & Data Toolkit" branch is
  dropped — including its "Modes" subsections. Nothing from inside the
  mini-project survives. The heading itself does not appear as a node.

  The output continues directly with "Classes, Objects, and State" as
  the next child of the root.

  Same rule applies to every mini-project and capstone, whatever the
  label style.

━━━ EXAMPLE 5 — ORGANIZATIONAL PARENTHETICALS ━━━

Input excerpt:

  ### Day 1 (C Focus - PRACTICE HEAVY)
  ### Day 12 (Review & Integration)
  ### Session 2 — How PHP Actually Runs in Production (PHP-FPM Preview)

Expected output (titles after cleaning):

  "Day 1"
  "Review & Integration"
  "How PHP Actually Runs in Production (PHP-FPM Preview)"

Rationale:
  "(C Focus - PRACTICE HEAVY)" is a pacing/effort label → stripped.
  "(Review & Integration)" names the day's purpose → kept.
  "(PHP-FPM Preview)" names a specific topic → kept.

━━━ EXAMPLE 6 — THE PROJECT RULE APPLIED TO UNLABELED PROJECTS ━━━

Input excerpt:

  ## Advanced Project — LAN File Sharing App

  **Build:** An app that transfers files between two Android devices
  on the same Wi-Fi network using raw TCP sockets.

  ### Raw Sockets, Server-Client Communication & Multi-Threading
  - Server and client socket communication
  - Reading and writing bytes over network
  - Handling multiple clients with threads

  ### Background Services, Service Communication & Notifications
  - Running long operations without blocking UI
  - Communicating service state to UI

  ## Architecture & State Management
  ### Configuration Changes, State Loss & Lifecycle Awareness
  #### Concepts
  - What happens during rotation or system recreation
  - Why naive approaches lose state

Expected output:

  The entire "Advanced Project — LAN File Sharing App" branch is dropped
  — including its "Raw Sockets..." and "Background Services..."
  subsections. Even though the bullets inside read like real theory
  (socket communication, background services), the parent heading is a
  build assignment and the rule is to drop the entire branch.

  Notice the heading does not match any of the literal labels in the
  illustrative list ("MINI-PROJECT", "CAPSTONE", "Project N"). It is
  caught by the semantic test: does the heading introduce a section
  where the learner builds something? Yes — "Project" is right there,
  and the content instructs the learner to construct an app.

  The output continues directly with "Architecture & State Management"
  as the next child of the root.

  Same rule catches headings that name the artifact without saying
  "Project": "Weather App", "GitHub Explorer", "Real-Time Chat App",
  "Library Management System", "Contact Manager". If the section
  instructs the learner to build it, the section is dropped.

━━━ EXAMPLE 7 — NESTED PROJECT INSIDE A STRUCTURAL NODE ━━━

Input excerpt:

  ### Day 10
  - Introduction to linked lists
  - Node structures and traversal
  - GDB for linked lists

  ### Day 11 (MINI-PROJECT: UNIX SHELL)
  - Build a shell that handles pipes and redirection
  - Parser state machine with enums
  - Built-in command dispatch table

  ### Day 12 (Review & Integration)
  - Makefile dependency generation
  - Header file tracking

Expected output:

  "Day 10" is kept with its bullets.
  The entire "Day 11 (MINI-PROJECT: UNIX SHELL)" branch is dropped — the
  ordinal "Day 11" collapses, the parenthetical is not "kept as a topic"
  because the branch is a project, and no bullet from inside the shell
  project survives. Even though one subsection inside the project may
  touch on generic tools like Valgrind, that content belongs to the
  project, not the syllabus, and goes with it.
  "Day 12 (Review & Integration)" is kept, with the ordinal stripped per
  the usual title rules, and its bullets promoted.
`.trim();

  // ───────────────────────────────────────────────────────────────────────
  // DOM references
  // ───────────────────────────────────────────────────────────────────────

  const $ = (id) => document.getElementById(id);

  const els = {
    dropzone: $("dropzone"),
    fileInput: $("file-input"),
    fileMeta: $("file-meta"),
    fileName: $("file-name"),
    fileSize: $("file-size"),
    fileClear: $("file-clear"),

    runBtn: $("run-btn"),
    debugToggle: $("debug-toggle"),
    statusRow: $("status-row"),
    spinner: $("spinner"),
    statusText: $("status-text"),
    errorBox: $("error-box"),

    resultPanel: $("result-panel"),
    validationBadge: $("validation-badge"),
    downloadBtn: $("download-btn"),
    debugBlock: $("debug-block"),
    debugPre: $("debug-pre"),
    debugCopy: $("debug-copy"),
    tree: $("tree"),
    treeExpand: $("tree-expand"),
    treeCollapse: $("tree-collapse"),
  };

  // ───────────────────────────────────────────────────────────────────────
  // State
  // ───────────────────────────────────────────────────────────────────────

  const state = {
    file: null,  // { name, size, text }
    cleaned: null,  // parsed JSON tree
    rawOutput: "",
    running: false,
  };

  // ───────────────────────────────────────────────────────────────────────
  // Config (read once from config.js)
  // ───────────────────────────────────────────────────────────────────────

  function getConfig() {
    const c = window.ROADMAP_CLEANER_CONFIG || {};

    if (!c.GEMINI_API_KEY || !c.GEMINI_API_KEY.trim()) {
      throw new Error(
        "No API key configured. Open config.js and set GEMINI_API_KEY."
      );
    }

    return {
      apiKey: c.GEMINI_API_KEY.trim(),
      model: (c.GEMINI_MODEL || "gemini-3.5-flash").trim(),
      baseUrl: (c.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta").trim(),
      temperature: c.TEMPERATURE ?? 0.7,
      thinkingBudget: c.THINKING_BUDGET ?? 0,
      timeout: c.REQUEST_TIMEOUT ?? 300000,
      systemPrompt: CLEANING_SYSTEM_PROMPT,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Gemini client (mirrors GeminiClient.php)
  // ───────────────────────────────────────────────────────────────────────

  async function callGemini(userPrompt, systemPrompt, cfg) {
    const url = `${cfg.baseUrl.replace(/\/+$/, "")}/models/${cfg.model}:generateContent`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: cfg.temperature,
        thinkingConfig: { thinkingBudget: cfg.thinkingBudget },
      },
    };

    if (systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeout);

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "x-goog-api-key": cfg.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new Error(`Request timed out after ${Math.round(cfg.timeout / 1000)}s.`);
      }
      throw new Error(`Network error: ${err.message}`);
    }
    clearTimeout(timer);

    // ── Rate limit — surface a friendly message (mirrors the Laravel client)
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new Error(
        `Gemini rate limit hit${retryAfter ? ` (retry after ${retryAfter}s)` : ""}. ` +
        "Wait a minute and try again."
      );
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(
        `Gemini API error ${response.status}: ${bodyText.slice(0, 500) || "(no body)"}`
      );
    }

    const body = await response.json().catch(async () => {
      const t = await response.text().catch(() => "");
      throw new Error(`Gemini returned a non-JSON response body. Preview: ${t.slice(0, 300)}`);
    });

    // ── Extract the last non-thought text part
    const parts = body?.candidates?.[0]?.content?.parts ?? [];
    let text = null;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (!p || typeof p.text !== "string") continue;
      if (p.thought) continue;
      text = p.text;
      break;
    }

    if (!text || !text.trim()) {
      const finishReason = body?.candidates?.[0]?.finishReason ?? "unknown";
      const partKeys = parts.map((p) => Object.keys(p || {}).join(",")).join(" | ");
      throw new Error(
        `Gemini returned an empty response (finishReason: ${finishReason}; ` +
        `parts: ${partKeys || "none"}).`
      );
    }

    return { text, rawBody: body };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Sanitize + parse the model's text output
  // ───────────────────────────────────────────────────────────────────────

  function sanitizeModelText(text) {
    if (typeof text !== "string") return "";

    // 1. Strip UTF-8 BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    // 2. Strip markdown fences if any slipped through
    let t = text.trim();
    if (t.startsWith("```")) {
      t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      t = t.trim();
    }

    // 3. Scrub invalid UTF-8 — the browser gives us a JS string already
    //    decoded. Belt-and-braces: re-encode/decode to drop lone surrogates.
    try {
      t = new TextDecoder("utf-8", { fatal: false }).decode(
        new TextEncoder().encode(t)
      );
    } catch { /* ignore */ }

    return t;
  }

  function parseCleanedJson(text) {
    const clean = sanitizeModelText(text);
    try {
      return JSON.parse(clean);
    } catch (err) {
      const preview = clean.slice(0, 400);
      const tail = clean.slice(-200);
      throw new Error(
        `Model returned invalid JSON: ${err.message}\n` +
        `Length: ${clean.length} chars.\n\n` +
        `── Head ──\n${preview}\n\n` +
        `── Tail ──\n${tail}`
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Top-level normalization
  // ───────────────────────────────────────────────────────────────────────
  //
  // The cleaning prompt asks for a single root object. The model occasionally
  // returns the same object wrapped in a one-element array — a common Gemini
  // failure mode when the source roadmap has multiple top-level sections.
  // Rather than fail validation, we unwrap silently. If the array has more
  // than one element, or the element is itself malformed, we leave it as-is
  // so the schema validator reports the problem clearly.

  function normalizeTopLevel(parsed) {
    if (Array.isArray(parsed) && parsed.length === 1 && parsed[0] &&
      typeof parsed[0] === "object" && !Array.isArray(parsed[0])) {
      return parsed[0];
    }
    return parsed;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Schema validation
  // ───────────────────────────────────────────────────────────────────────

  function validateNode(node, path = "root") {
    const errs = [];

    if (Array.isArray(node)) {
      errs.push(
        `${path}: expected object, got array. ` +
        `The top-level value must be a single JSON object, not an array.`
      );
      return errs;
    }

    if (node === null || typeof node !== "object") {
      errs.push(`${path}: not an object`);
      return errs;
    }

    if (typeof node.title !== "string") {
      errs.push(`${path}.title: expected string, got ${typeof node.title}`);
    }
    if (typeof node.description !== "string") {
      errs.push(`${path}.description: expected string, got ${typeof node.description}`);
    }
    if (!Array.isArray(node.children)) {
      errs.push(`${path}.children: expected array, got ${typeof node.children}`);
    } else {
      node.children.forEach((child, i) => {
        errs.push(...validateNode(child, `${path}.children[${i}]`));
      });
    }
    return errs;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Rendering
  // ───────────────────────────────────────────────────────────────────────

  // Escape HTML, then re-allow inline markdown (code + bold).
  function renderInlineMarkdown(text) {
    const esc = String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    let out = esc.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return out;
  }

  function buildTreeNode(node, depth) {
    const wrap = document.createElement("div");
    wrap.className = `tree-node tree-depth-${depth}`;

    const row = document.createElement("div");
    row.className = "tree-row";

    const hasChildren = Array.isArray(node.children) && node.children.length > 0;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tree-toggle" + (hasChildren ? "" : " leaf");
    toggle.textContent = "▾";
    row.appendChild(toggle);

    const titleWrap = document.createElement("div");
    titleWrap.className = "tree-title" + (hasChildren ? "" : " leaf-title");
    titleWrap.innerHTML = renderInlineMarkdown(node.title);

    if (node.description && String(node.description).trim() !== "") {
      const desc = document.createElement("span");
      desc.className = "tree-desc";
      desc.textContent = node.description;
      titleWrap.appendChild(desc);
    }
    row.appendChild(titleWrap);
    wrap.appendChild(row);

    if (hasChildren) {
      const childWrap = document.createElement("div");
      childWrap.className = "tree-children";
      for (const child of node.children) {
        childWrap.appendChild(buildTreeNode(child, depth + 1));
      }
      wrap.appendChild(childWrap);

      toggle.addEventListener("click", () => {
        const hidden = childWrap.hasAttribute("hidden");
        if (hidden) {
          childWrap.removeAttribute("hidden");
          toggle.classList.remove("collapsed");
        } else {
          childWrap.setAttribute("hidden", "");
          toggle.classList.add("collapsed");
        }
      });
    }

    return wrap;
  }

  function renderTree(rootNode) {
    els.tree.innerHTML = "";
    els.tree.appendChild(buildTreeNode(rootNode, 0));
  }

  function setAllCollapsed(collapsed) {
    els.tree.querySelectorAll(".tree-node").forEach((nodeEl) => {
      const childWrap = nodeEl.querySelector(":scope > .tree-children");
      const toggle = nodeEl.querySelector(":scope > .tree-row > .tree-toggle");
      if (!childWrap || !toggle) return;
      if (collapsed) {
        childWrap.setAttribute("hidden", "");
        toggle.classList.add("collapsed");
      } else {
        childWrap.removeAttribute("hidden");
        toggle.classList.remove("collapsed");
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // File handling
  // ───────────────────────────────────────────────────────────────────────

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  async function acceptFile(file) {
    const isMarkdown =
      /\.(md|markdown|txt)$/i.test(file.name) || file.type.startsWith("text/");

    if (!isMarkdown) {
      showError(`Unsupported file type: ${file.name}. Expected .md, .markdown, or .txt.`);
      return;
    }

    let text;
    try {
      text = await file.text();
    } catch (err) {
      showError(`Could not read file: ${err.message}`);
      return;
    }

    state.file = { name: file.name, size: file.size, text };

    els.fileName.textContent = file.name;
    els.fileSize.textContent = formatBytes(file.size);
    els.fileMeta.hidden = false;
    els.runBtn.disabled = false;

    clearError();
    hideResult();
  }

  function clearFile() {
    state.file = null;
    els.fileInput.value = "";
    els.fileMeta.hidden = true;
    els.runBtn.disabled = true;
    hideResult();
    clearError();
  }

  // ───────────────────────────────────────────────────────────────────────
  // UI helpers
  // ───────────────────────────────────────────────────────────────────────

  function showError(msg) {
    els.errorBox.textContent = msg;
    els.errorBox.hidden = false;
  }

  function clearError() {
    els.errorBox.textContent = "";
    els.errorBox.hidden = true;
  }

  function setStatus(text, spinning = false) {
    els.statusRow.hidden = false;
    els.statusText.textContent = text;
    els.spinner.hidden = !spinning;
  }

  function hideStatus() {
    els.statusRow.hidden = true;
    els.spinner.hidden = true;
  }

  function hideResult() {
    els.resultPanel.hidden = true;
    state.cleaned = null;
    state.rawOutput = "";
    els.tree.innerHTML = "";
    els.debugPre.textContent = "";
  }

  function setBadge(kind, text) {
    els.validationBadge.className = "badge " + kind;
    els.validationBadge.textContent = text;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Main pipeline
  // ───────────────────────────────────────────────────────────────────────

  async function runCleaning() {
    if (state.running || !state.file) return;

    state.running = true;
    els.runBtn.disabled = true;
    clearError();
    hideResult();
    setStatus("Sending to Gemini…", true);

    let cfg;
    try {
      cfg = getConfig();
    } catch (err) {
      showError(err.message);
      setBadge("fail", "Config error");
      hideStatus();
      state.running = false;
      els.runBtn.disabled = false;
      return;
    }

    try {
      const { text } = await callGemini(state.file.text, cfg.systemPrompt, cfg);
      state.rawOutput = text;

      setStatus("Parsing response…", true);
      const parsed = parseCleanedJson(text);

      // Unwrap a one-element top-level array if the model wrapped the
      // output. See normalizeTopLevel() for the rationale.
      const normalized = normalizeTopLevel(parsed);

      setStatus("Validating schema…", true);
      const errors = validateNode(normalized);

      if (errors.length > 0) {
        setBadge("fail", `Schema error (${errors.length})`);
        showError(
          "The model returned JSON, but it does not match the expected schema:\n\n" +
          errors.slice(0, 8).join("\n") +
          (errors.length > 8 ? `\n… and ${errors.length - 8} more.` : "")
        );
        state.cleaned = normalized;
        renderTree(normalized);
        els.debugPre.textContent = text;
        els.debugBlock.hidden = !els.debugToggle.checked;
        els.resultPanel.hidden = false;
        hideStatus();
        return;
      }

      setBadge("ok", "Schema OK");
      state.cleaned = normalized;
      renderTree(normalized);
      els.debugPre.textContent = text;
      els.debugBlock.hidden = !els.debugToggle.checked;
      els.resultPanel.hidden = false;

      setStatus("Done.", false);
      setTimeout(hideStatus, 1200);

    } catch (err) {
      showError(err.message || String(err));
      setBadge("fail", "Failed");
      hideStatus();
    } finally {
      state.running = false;
      els.runBtn.disabled = !state.file;
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Download
  // ───────────────────────────────────────────────────────────────────────

  function downloadJson() {
    if (!state.cleaned || !state.file) return;

    const baseName = state.file.name.replace(/\.(md|markdown|txt)$/i, "");
    const filename = `${baseName}-cleaned.json`;

    const blob = new Blob(
      [JSON.stringify(state.cleaned, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Event wiring
  // ───────────────────────────────────────────────────────────────────────

  function wireEvents() {

    // ── dropzone
    els.dropzone.addEventListener("click", () => els.fileInput.click());
    els.dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        els.fileInput.click();
      }
    });

    els.fileInput.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) acceptFile(f);
    });

    ["dragenter", "dragover"].forEach((ev) =>
      els.dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        els.dropzone.classList.add("dragover");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      els.dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        els.dropzone.classList.remove("dragover");
      })
    );
    els.dropzone.addEventListener("drop", (e) => {
      const f = e.dataTransfer?.files?.[0];
      if (f) acceptFile(f);
    });

    els.fileClear.addEventListener("click", clearFile);

    // ── run
    els.runBtn.addEventListener("click", runCleaning);

    // ── debug toggle — show/hide after a run
    els.debugToggle.addEventListener("change", () => {
      if (state.rawOutput) {
        els.debugBlock.hidden = !els.debugToggle.checked;
      }
    });

    // ── download
    els.downloadBtn.addEventListener("click", downloadJson);

    // ── tree expand/collapse
    els.treeExpand.addEventListener("click", () => setAllCollapsed(false));
    els.treeCollapse.addEventListener("click", () => setAllCollapsed(true));

    // ── copy raw output
    els.debugCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(els.debugPre.textContent);
        els.debugCopy.textContent = "Copied";
        setTimeout(() => (els.debugCopy.textContent = "Copy"), 1200);
      } catch {
        els.debugCopy.textContent = "Failed";
        setTimeout(() => (els.debugCopy.textContent = "Copy"), 1200);
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // Boot
  // ───────────────────────────────────────────────────────────────────────

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("roadmap-cleaner-theme", theme); } catch (_) { }
  }

  function boot() {
    // ── theme toggle
    const themeToggle = document.getElementById("theme-toggle");
    if (themeToggle) {
      themeToggle.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") === "light"
          ? "light"
          : "dark";
        const next = current === "light" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", next);
        try { localStorage.setItem("roadmap-cleaner-theme", next); } catch (_) { /* ignore */ }
      });
    }

    document.getElementById("theme-light")?.addEventListener("click", () => setTheme("light"));
    document.getElementById("theme-dark")?.addEventListener("click", () => setTheme("dark"));
    
    wireEvents();
    hideStatus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();