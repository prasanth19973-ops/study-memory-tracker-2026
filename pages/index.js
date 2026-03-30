import { useState, useEffect, useMemo, useCallback, useRef } from "react";

// ─── Constants ───
const YEAR = 2026;
const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 60, 90, 180, 270, 365];
const DECAY_CONSTANT = 0.693;
const CATEGORIES = [
  "Cardiology", "Endocrine", "Neurology", "Pulmonology", "Renal",
  "GI / Hepatology", "Hematology / Oncology", "Infectious Disease",
  "Rheumatology", "Dermatology", "Psychiatry", "OB/GYN",
  "Pediatrics", "Surgery", "MSK / Ortho", "Biostatistics / Epi", "Other"
];
const CAT_ICONS = {
  "Cardiology": "❤️", "Endocrine": "🦋", "Neurology": "🧠", "Pulmonology": "🫁",
  "Renal": "🫘", "GI / Hepatology": "🟡", "Hematology / Oncology": "🩸",
  "Infectious Disease": "🦠", "Rheumatology": "🦴", "Dermatology": "🧴",
  "Psychiatry": "🧩", "OB/GYN": "👶", "Pediatrics": "🧒", "Surgery": "🔪",
  "MSK / Ortho": "💪", "Biostatistics / Epi": "📊", "Other": "📌"
};
const STATUS_COLORS = {
  completed: "#22c55e", pending: "#eab308", missed: "#ef4444",
  partial: "#f97316", strong: "#22c55e", moderate: "#eab308",
  weak: "#ef4444", forgotten: "#6b7280"
};

// ─── Helpers ───
const fmtDate = (d) => { if (!d) return ""; const dt = new Date(d); return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
const fmtDateFull = (d) => { if (!d) return ""; const dt = new Date(d); return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const toKey = (d) => { const dt = typeof d === "string" ? new Date(d) : d; return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`; };
const today = () => toKey(new Date());
const daysBetween = (a, b) => { const d1 = new Date(a), d2 = new Date(b); return Math.round((d2 - d1) / 86400000); };
const addDays = (dateStr, n) => { const d = new Date(dateStr); d.setDate(d.getDate() + n); return toKey(d); };
const isIn2026 = (dateStr) => new Date(dateStr).getFullYear() === YEAR;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ─── Retention Model ───
function calcRetention(topic) {
  const lastReview = topic.lastReviewDate || topic.dateStudied;
  const elapsed = Math.max(0, daysBetween(lastReview, today()));
  const stage = topic.reviewStage || 0;
  const intervalWeight = REVIEW_INTERVALS[Math.min(stage, REVIEW_INTERVALS.length - 1)];
  const boost = 1 + stage * 0.35;
  return Math.round(Math.max(0, Math.min(100, 100 * Math.exp(-DECAY_CONSTANT * elapsed / (intervalWeight * boost)))));
}
function getRetentionStatus(r) {
  if (r >= 80) return { label: "Strong", color: STATUS_COLORS.strong, risk: "low" };
  if (r >= 50) return { label: "Moderate", color: STATUS_COLORS.moderate, risk: "medium" };
  if (r >= 20) return { label: "Weak — review soon", color: STATUS_COLORS.weak, risk: "high" };
  return { label: "Effectively forgotten for exam recall", color: STATUS_COLORS.forgotten, risk: "critical" };
}
function getWarning(topic) {
  if (!topic.nextReviewDate) return null;
  const od = daysBetween(topic.nextReviewDate, today());
  if (od <= 0) return null;
  if (od > 60) return { text: "Effectively forgotten — restart cycle", severity: "critical" };
  if (od > 14) return { text: "Urgent review needed", severity: "high" };
  if (od > 3) return { text: "Retention dropping", severity: "medium" };
  return { text: "High risk of forgetting", severity: "low" };
}
function generateSchedule(dateStudied) { return REVIEW_INTERVALS.map(i => addDays(dateStudied, i)).filter(isIn2026); }
function getRecommendation(topic) {
  const r = calcRetention(topic);
  const mc = (topic.reviewHistory || []).filter(h => h.action === "missed" || h.action === "skipped").length;
  if (r < 20) return "restart";
  if (mc >= 3 || r < 40) return "urgent";
  return "maintain";
}

// ─── Storage ───
const STORAGE_KEY = "smt2026_data_v2";
function loadData() { try { const r = window.localStorage?.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {} return null; }
function saveData(data) { try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {} }
const DEFAULT_DATA = { topics: [], dailyNotes: {}, streak: 0, lastActiveDate: null, collapsedCategories: {} };

function makeSample() {
  const samples = [
    { name: "Heart Failure — Systolic vs Diastolic", cat: "Cardiology", daysAgo: 45, stage: 3 },
    { name: "Post-MI Complications", cat: "Cardiology", daysAgo: 30, stage: 2 },
    { name: "Atrial Fibrillation Management", cat: "Cardiology", daysAgo: 12, stage: 1 },
    { name: "Aortic Stenosis Murmur & Tx", cat: "Cardiology", daysAgo: 5, stage: 0 },
    { name: "DKA vs HHS Management", cat: "Endocrine", daysAgo: 20, stage: 2 },
    { name: "Thyroid Storm vs Myxedema Coma", cat: "Endocrine", daysAgo: 8, stage: 1 },
    { name: "Adrenal Insufficiency Workup", cat: "Endocrine", daysAgo: 3, stage: 0 },
    { name: "Meningitis — CSF Findings", cat: "Infectious Disease", daysAgo: 5, stage: 1 },
    { name: "TB Diagnosis & RIPE Therapy", cat: "Infectious Disease", daysAgo: 15, stage: 1 },
    { name: "Stroke — tPA Criteria", cat: "Neurology", daysAgo: 60, stage: 4 },
    { name: "Seizure Classification & Tx", cat: "Neurology", daysAgo: 10, stage: 1 },
    { name: "COPD Exacerbation Tx", cat: "Pulmonology", daysAgo: 2, stage: 0 },
    { name: "Nephrotic vs Nephritic", cat: "Renal", daysAgo: 30, stage: 2 },
    { name: "Iron Deficiency Anemia Workup", cat: "Hematology / Oncology", daysAgo: 10, stage: 1 },
    { name: "Hemochromatosis vs Amyloidosis", cat: "Cardiology", daysAgo: 8, stage: 1 },
  ];
  return samples.map(s => {
    const dateStudied = addDays(today(), -s.daysAgo);
    const schedule = generateSchedule(dateStudied);
    const lastReview = s.stage > 0 ? addDays(dateStudied, REVIEW_INTERVALS[s.stage - 1]) : dateStudied;
    return {
      id: uid(), name: s.name, category: s.cat, dateStudied, lastReviewDate: lastReview,
      nextReviewDate: schedule[s.stage] || null, reviewStage: s.stage,
      scheduledDates: schedule, reviewHistory: [], notes: "", archived: false
    };
  });
}

// ─── Icons ───
const Icon = ({ d, size = 18, color = "currentColor", ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d={d} /></svg>
);
const PlusIcon = (p) => <Icon d="M12 5v14M5 12h14" {...p} />;
const CheckIcon = (p) => <Icon d="M20 6L9 17l-5-5" {...p} />;
const XIcon = (p) => <Icon d="M18 6L6 18M6 6l12 12" {...p} />;
const ChevronLeft = (p) => <Icon d="M15 18l-6-6 6-6" {...p} />;
const ChevronRight = (p) => <Icon d="M9 18l6-6-6-6" {...p} />;
const ChevronDown = (p) => <Icon d="M6 9l6 6 6-6" {...p} />;
const ChevronUp = (p) => <Icon d="M6 15l6-6 6 6" {...p} />;
const CalendarIcon = (p) => <Icon d="M3 6h18M3 6v14a2 2 0 002 2h14a2 2 0 002-2V6M3 6V4a2 2 0 012-2h2M19 6V4a2 2 0 00-2-2h-2M8 2v4M16 2v4" {...p} />;
const BookIcon = (p) => <Icon d="M4 19V5a2 2 0 012-2h8a2 2 0 012 2v14M4 19h12M18 5a2 2 0 012 2v10a2 2 0 01-2 2H6" {...p} />;
const ClockIcon = (p) => <Icon d="M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2" {...p} />;
const InfoIcon = (p) => <Icon d="M12 2a10 10 0 100 20 10 10 0 000-20zM12 16v-4M12 8h.01" {...p} />;
const DownloadIcon = (p) => <Icon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" {...p} />;
const UploadIcon = (p) => <Icon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" {...p} />;
const TrashIcon = (p) => <Icon d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6" {...p} />;
const EditIcon = (p) => <Icon d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" {...p} />;

// ─── Small Components ───
function RetentionBar({ value, width = "100%", height = 8 }) {
  const s = getRetentionStatus(value);
  return (
    <div style={{ width, background: "rgba(255,255,255,0.06)", borderRadius: 6, height, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", borderRadius: 6, background: s.color, transition: "width 0.5s ease, background 0.3s" }} />
    </div>
  );
}
function Badge({ children, color = "#888", style = {} }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: color + "22", color, letterSpacing: "0.02em", ...style }}>{children}</span>;
}
function CountdownBadge({ nextDate }) {
  if (!nextDate) return null;
  const days = daysBetween(today(), nextDate);
  if (days === 0) return <Badge color="#eab308">Due today</Badge>;
  if (days > 0) return <Badge color="#3b82f6">Review in {days}d</Badge>;
  return <Badge color="#ef4444">{Math.abs(days)}d overdue</Badge>;
}

// ─── Editable Text ───
function EditableText({ value, onSave, style: outerStyle = {}, inputStyle = {} }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);
  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
    setEditing(false);
  };

  if (editing) return (
    <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); }}}
      style={{
        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(139,92,246,0.4)",
        borderRadius: 6, color: "#f0f0f0", fontSize: 14, fontWeight: 600, padding: "2px 8px",
        outline: "none", fontFamily: "'DM Sans', sans-serif", width: "100%", ...inputStyle
      }} />
  );

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", ...outerStyle }}
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}>
      <span style={{ borderBottom: "1px dashed rgba(255,255,255,0.15)" }}>{value}</span>
      <EditIcon size={12} color="#666" style={{ flexShrink: 0, opacity: 0.6 }} />
    </span>
  );
}

// ─── Topic Card ───
const actionBtnStyle = (color) => ({
  display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
  padding: "4px 10px", fontSize: 11, fontWeight: 600,
  background: color + "15", color, border: `1px solid ${color}33`,
  borderRadius: 8, cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap"
});

function TopicCard({ topic, onAction, onClick, onRename }) {
  const retention = calcRetention(topic);
  const status = getRetentionStatus(retention);
  const warning = getWarning(topic);
  return (
    <div onClick={onClick} style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12, padding: "14px 16px", cursor: "pointer",
      transition: "all 0.2s", borderLeft: `3px solid ${status.color}`,
    }}
    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.transform = "none"; }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 4 }}>
            <EditableText value={topic.name} onSave={(v) => onRename(topic.id, v)}
              style={{ fontWeight: 600, fontSize: 14, color: "#f0f0f0" }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 }}>
            <Badge color="#8b5cf6">{topic.category}</Badge>
            <CountdownBadge nextDate={topic.nextReviewDate} />
            {warning && <Badge color={warning.severity === "critical" ? "#6b7280" : STATUS_COLORS.missed}>{warning.text}</Badge>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: "#999", minWidth: 90 }}>Retention: {retention}%</span>
            <RetentionBar value={retention} />
          </div>
          <div style={{ fontSize: 11, color: "#777" }}>
            Forgetting: {100 - retention}% · Stage {topic.reviewStage + 1}/{REVIEW_INTERVALS.length} · Studied {fmtDate(topic.dateStudied)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onAction(topic.id, "reviewed")} style={actionBtnStyle("#22c55e")} title="Reviewed"><CheckIcon size={14} /> Done</button>
          <button onClick={() => onAction(topic.id, "partial")} style={actionBtnStyle("#f97316")} title="Partial">½</button>
          <button onClick={() => onAction(topic.id, "skipped")} style={actionBtnStyle("#ef4444")} title="Skipped"><XIcon size={14} /></button>
        </div>
      </div>
    </div>
  );
}

// ─── Category Group Card ───
function CategoryGroup({ category, topics, collapsed, onToggle, onAction, onClickTopic, onRename }) {
  const avgRetention = topics.length > 0 ? Math.round(topics.reduce((s, t) => s + calcRetention(t), 0) / topics.length) : 0;
  const retStatus = getRetentionStatus(avgRetention);
  const dueCount = topics.filter(t => t.nextReviewDate && daysBetween(t.nextReviewDate, today()) >= 0).length;
  const overdueCount = topics.filter(t => t.nextReviewDate && daysBetween(t.nextReviewDate, today()) > 0).length;
  const icon = CAT_ICONS[category] || "📌";

  return (
    <div style={{ marginBottom: 14 }}>
      <div onClick={onToggle} style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: collapsed ? 12 : "12px 12px 0 0", cursor: "pointer",
        transition: "all 0.2s", userSelect: "none"
      }}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
      onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#e8e8e8", fontFamily: "'DM Serif Display', serif" }}>{category}</span>
            <span style={{ fontSize: 12, color: "#777" }}>({topics.length} subtopic{topics.length !== 1 ? "s" : ""})</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, maxWidth: 200 }}>
              <span style={{ fontSize: 11, color: "#999", whiteSpace: "nowrap" }}>Avg: {avgRetention}%</span>
              <RetentionBar value={avgRetention} height={6} />
            </div>
            {dueCount > 0 && <Badge color="#eab308">{dueCount} due</Badge>}
            {overdueCount > 0 && <Badge color="#ef4444">{overdueCount} overdue</Badge>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: retStatus.color, fontFamily: "'Space Mono', monospace" }}>{avgRetention}%</span>
          {collapsed ? <ChevronDown size={18} color="#888" /> : <ChevronUp size={18} color="#888" />}
        </div>
      </div>

      {!collapsed && (
        <div style={{
          border: "1px solid rgba(255,255,255,0.07)", borderTop: "none",
          borderRadius: "0 0 12px 12px", padding: 8,
          background: "rgba(255,255,255,0.015)"
        }}>
          {topics.sort((a, b) => calcRetention(a) - calcRetention(b)).map(t => (
            <div key={t.id} style={{ padding: "4px 0" }}>
              <TopicCard topic={t} onAction={onAction} onClick={() => onClickTopic(t.id)} onRename={onRename} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Topic Detail ───
function TopicDetail({ topic, onClose, onAction, onUpdateNotes, onDelete, onRename }) {
  const retention = calcRetention(topic);
  const status = getRetentionStatus(retention);
  const recommendation = getRecommendation(topic);
  const warning = getWarning(topic);
  const missedCount = (topic.reviewHistory || []).filter(h => h.action === "missed" || h.action === "skipped").length;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center", padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "85vh", overflow: "auto", padding: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div style={{ flex: 1, marginRight: 12 }}>
            <EditableText value={topic.name} onSave={(v) => onRename(topic.id, v)}
              style={{ fontSize: 20, fontWeight: 700, color: "#f0f0f0", fontFamily: "'DM Serif Display', serif" }}
              inputStyle={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Serif Display', serif" }} />
            <div style={{ marginTop: 6 }}><Badge color="#8b5cf6">{topic.category}</Badge></div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", padding: 4 }}><XIcon size={20} /></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {[["First Studied", fmtDateFull(topic.dateStudied)], ["Last Reviewed", fmtDateFull(topic.lastReviewDate || topic.dateStudied)],
            ["Next Review", topic.nextReviewDate ? fmtDateFull(topic.nextReviewDate) : "Complete"], ["Stage", `${topic.reviewStage + 1} / ${REVIEW_INTERVALS.length}`]
          ].map(([l, v]) => (
            <div key={l} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#777", marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 14, color: "#ddd", fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: "#aaa" }}>Retention Estimate</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: status.color, fontFamily: "'Space Mono', monospace" }}>{retention}%</span>
          </div>
          <RetentionBar value={retention} />
          <div style={{ fontSize: 11, color: "#777", marginTop: 4 }}>Forgetting: {100 - retention}% · {status.label}</div>
          {warning && <div style={{ fontSize: 12, color: STATUS_COLORS.missed, marginTop: 6, fontWeight: 500 }}>⚠ {warning.text}</div>}
        </div>

        <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd", marginBottom: 8 }}>Recommendation</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: recommendation === "restart" ? "#ef4444" : recommendation === "urgent" ? "#f97316" : "#22c55e" }}>
            {recommendation === "restart" && "🔄 Restart cycle — retention too low for meaningful review progression"}
            {recommendation === "urgent" && "⚡ Urgent review needed — schedule this topic immediately"}
            {recommendation === "maintain" && "✓ On track — continue current review schedule"}
          </div>
          <div style={{ fontSize: 11, color: "#777", marginTop: 4 }}>Missed reviews: {missedCount}</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd", marginBottom: 8 }}>Scheduled Reviews</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(topic.scheduledDates || []).map((d, i) => {
              const isPast = daysBetween(d, today()) > 0;
              const isCurrent = i === topic.reviewStage;
              const done = i < topic.reviewStage;
              return (
                <span key={d} style={{
                  fontSize: 11, padding: "3px 8px", borderRadius: 6,
                  background: done ? "#22c55e22" : isCurrent ? "#eab30822" : isPast ? "#ef444422" : "rgba(255,255,255,0.05)",
                  color: done ? "#22c55e" : isCurrent ? "#eab308" : isPast ? "#ef4444" : "#888",
                  fontWeight: isCurrent ? 700 : 400, border: isCurrent ? "1px solid #eab30844" : "1px solid transparent"
                }}>{fmtDate(d)} {done && "✓"}</span>
              );
            })}
          </div>
        </div>

        {(topic.reviewHistory || []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd", marginBottom: 8 }}>Review History</div>
            {topic.reviewHistory.slice(-8).reverse().map((h, i) => (
              <div key={i} style={{ fontSize: 12, color: "#999", padding: "3px 0", display: "flex", gap: 8 }}>
                <span style={{ color: "#666", minWidth: 75 }}>{fmtDate(h.date)}</span>
                <Badge color={h.action === "reviewed" ? "#22c55e" : h.action === "partial" ? "#f97316" : "#ef4444"}>{h.action}</Badge>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd", marginBottom: 6 }}>Notes</div>
          <textarea value={topic.notes || ""} onChange={e => onUpdateNotes(topic.id, e.target.value)}
            placeholder="Add notes about this topic..."
            style={{ width: "100%", minHeight: 70, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#ccc", padding: 10, fontSize: 13, resize: "vertical", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }} />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => onAction(topic.id, "reviewed")} style={{ ...pillBtn, background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e33" }}><CheckIcon size={14} /> Reviewed</button>
          <button onClick={() => onAction(topic.id, "partial")} style={{ ...pillBtn, background: "#f9731622", color: "#f97316", border: "1px solid #f9731633" }}>½ Partial</button>
          <button onClick={() => { onDelete(topic.id); onClose(); }} style={{ ...pillBtn, background: "#ef444422", color: "#ef4444", border: "1px solid #ef444433", marginLeft: "auto" }}><TrashIcon size={14} /> Delete</button>
        </div>
      </div>
    </div>
  );
}
const pillBtn = { display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 10, cursor: "pointer" };

// ─── Add Topic Form ───
function AddTopicForm({ onAdd, selectedDate }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Cardiology");
  const [open, setOpen] = useState(false);
  const handleAdd = () => { if (!name.trim()) return; onAdd({ name: name.trim(), category, dateStudied: selectedDate || today() }); setName(""); setOpen(false); };

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{
      display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "12px 16px",
      background: "rgba(139,92,246,0.08)", border: "1px dashed rgba(139,92,246,0.3)",
      borderRadius: 12, color: "#a78bfa", fontSize: 14, fontWeight: 500, cursor: "pointer", transition: "all 0.2s"
    }}><PlusIcon size={16} /> Add topic studied today</button>
  );

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 16 }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Topic name..." autoFocus
        onKeyDown={e => e.key === "Enter" && handleAdd()}
        style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#f0f0f0", fontSize: 14, outline: "none", marginBottom: 10, boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={category} onChange={e => setCategory(e.target.value)} style={{
          padding: "6px 10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8, color: "#ccc", fontSize: 13, outline: "none", fontFamily: "'DM Sans', sans-serif"
        }}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <button onClick={handleAdd} style={{ padding: "6px 16px", background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add Topic</button>
        <button onClick={() => setOpen(false)} style={{ padding: "6px 12px", background: "none", color: "#888", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Calendar ───
function CalendarView({ month, topics, selectedDate, onSelectDate, onChangeMonth }) {
  const firstDay = new Date(YEAR, month, 1).getDay();
  const daysInMonth = new Date(YEAR, month + 1, 0).getDate();
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const dayMap = useMemo(() => {
    const m = {};
    topics.forEach(t => {
      const sd = t.dateStudied;
      if (!m[sd]) m[sd] = { studied: 0, due: 0, done: 0, missed: 0 };
      m[sd].studied++;
      (t.scheduledDates || []).forEach((d, i) => {
        if (!m[d]) m[d] = { studied: 0, due: 0, done: 0, missed: 0 };
        if (i < t.reviewStage) m[d].done++;
        else if (i === t.reviewStage && daysBetween(d, today()) > 0) m[d].missed++;
        else if (i === t.reviewStage) m[d].due++;
      });
    });
    return m;
  }, [topics]);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${YEAR}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const info = dayMap[dateStr] || {};
    const isToday = dateStr === today();
    const isSel = dateStr === selectedDate;
    const hasData = info.studied || info.due || info.done || info.missed;
    cells.push(
      <div key={d} onClick={() => onSelectDate(dateStr)} style={{
        position: "relative", aspectRatio: "1", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", borderRadius: 10, cursor: "pointer",
        background: isSel ? "rgba(139,92,246,0.2)" : isToday ? "rgba(255,255,255,0.06)" : "transparent",
        border: isToday ? "1px solid rgba(139,92,246,0.4)" : "1px solid transparent", transition: "all 0.15s"
      }}
      onMouseEnter={e => { if(!isSel) e.currentTarget.style.background="rgba(255,255,255,0.04)"; }}
      onMouseLeave={e => { if(!isSel) e.currentTarget.style.background=isToday?"rgba(255,255,255,0.06)":"transparent"; }}>
        <span style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: isToday ? "#a78bfa" : "#ccc" }}>{d}</span>
        {hasData && <div style={{ display: "flex", gap: 2, marginTop: 3 }}>
          {info.studied > 0 && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#3b82f6" }} />}
          {info.done > 0 && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e" }} />}
          {info.due > 0 && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#eab308" }} />}
          {info.missed > 0 && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#ef4444" }} />}
        </div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={() => onChangeMonth(-1)} disabled={month===0} style={{ background:"none",border:"none",color:month===0?"#444":"#aaa",cursor:"pointer",padding:4 }}><ChevronLeft size={20}/></button>
        <h3 style={{ margin: 0, color: "#e0e0e0", fontFamily: "'DM Serif Display', serif", fontSize: 18 }}>{monthNames[month]} {YEAR}</h3>
        <button onClick={() => onChangeMonth(1)} disabled={month===11} style={{ background:"none",border:"none",color:month===11?"#444":"#aaa",cursor:"pointer",padding:4 }}><ChevronRight size={20}/></button>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4 }}>
        {["S","M","T","W","T","F","S"].map((d,i)=><div key={i} style={{textAlign:"center",fontSize:11,color:"#666",fontWeight:600,padding:"4px 0"}}>{d}</div>)}
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2 }}>{cells}</div>
      <div style={{ display:"flex",gap:12,marginTop:12,justifyContent:"center",flexWrap:"wrap" }}>
        {[["#3b82f6","New"],["#22c55e","Done"],["#eab308","Due"],["#ef4444","Missed"]].map(([c,l])=>
          <div key={l} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#888"}}><div style={{width:7,height:7,borderRadius:"50%",background:c}}/>{l}</div>
        )}
      </div>
    </div>
  );
}

// ─── Logic Explainer ───
function LogicExplainer({ onClose }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",justifyContent:"center",alignItems:"center",padding:20 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#1a1a2e",border:"1px solid rgba(255,255,255,0.1)",borderRadius:16,width:"100%",maxWidth:600,maxHeight:"85vh",overflow:"auto",padding:28 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
          <h2 style={{ margin:0,color:"#f0f0f0",fontFamily:"'DM Serif Display', serif" }}>How This Works</h2>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#888",cursor:"pointer"}}><XIcon size={20}/></button>
        </div>
        {[
          ["Why do topics reappear?","Spaced repetition schedules reviews at increasing intervals (1→3→7→14→30→60→90→180→270→365 days). Early reviews are frequent because new memories fade fast; later reviews are spaced out as memory consolidates."],
          ["How is retention estimated?","Uses a simplified exponential decay: retention ≈ 100 × e^(−k × days_elapsed / interval_weight). The interval_weight improves with each successful review stage. This is a practical planning tool, not a neuroscience claim."],
          ["How do Units & Subtopics work?","Each category (Cardiology, Endocrine, etc.) acts as a 'unit.' Individual topics within that category are its subtopics. The unit header shows the average retention across all its subtopics — so you can instantly see which organ systems need the most work."],
          ["How do I edit topic names?","Click the pencil icon (✏) next to any topic name to rename it inline. Press Enter to save or Escape to cancel. This works on topic cards and in the detail panel."],
          ["What happens when reviews are missed?","Missed by a few days → stays same stage, flagged overdue. Missed 14+ days → urgent review. Missed 60+ days → restart cycle suggested."],
          ["What does 'effectively forgotten' mean?","When retention drops below ~20%, the topic is unlikely to be reliably recalled under exam conditions. Trace memories may remain, but treat it as fresh learning for study planning purposes."],
        ].map(([t,b])=><div key={t} style={{marginBottom:18}}><h3 style={{margin:"0 0 6px",color:"#a78bfa",fontSize:14,fontWeight:600}}>{t}</h3><p style={{margin:0,color:"#999",fontSize:13,lineHeight:1.6}}>{b}</p></div>)}
      </div>
    </div>
  );
}

// ─── Main App ───
export default function App() {
  const [data, setData] = useState(() => {
    const loaded = loadData();
    if (loaded?.topics?.length > 0) return { ...DEFAULT_DATA, ...loaded };
    return { ...DEFAULT_DATA, topics: makeSample() };
  });
  const [view, setView] = useState("daily");
  const [selectedDate, setSelectedDate] = useState(today());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [detailTopic, setDetailTopic] = useState(null);
  const [showLogic, setShowLogic] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef(null);

  useEffect(() => { saveData(data); }, [data]);
  useEffect(() => {
    const todayStr = today();
    setData(prev => {
      if (prev.lastActiveDate === todayStr) return prev;
      const yesterday = addDays(todayStr, -1);
      const newStreak = prev.lastActiveDate === yesterday ? prev.streak + 1 : 1;
      return { ...prev, streak: newStreak, lastActiveDate: todayStr };
    });
  }, []);

  const updateData = useCallback((fn) => setData(prev => ({ ...fn(prev) })), []);

  const addTopic = useCallback(({ name, category, dateStudied }) => {
    updateData(prev => {
      const schedule = generateSchedule(dateStudied);
      return { ...prev, topics: [...prev.topics, {
        id: uid(), name, category, dateStudied, lastReviewDate: dateStudied,
        nextReviewDate: schedule[0] || null, reviewStage: 0,
        scheduledDates: schedule, reviewHistory: [], notes: "", archived: false
      }]};
    });
  }, [updateData]);

  const handleAction = useCallback((id, action) => {
    updateData(prev => ({
      ...prev, topics: prev.topics.map(t => {
        if (t.id !== id) return t;
        const todayStr = today();
        const entry = { date: todayStr, action, stage: t.reviewStage };
        const history = [...(t.reviewHistory || []), entry];
        if (action === "reviewed") {
          const ns = Math.min(t.reviewStage + 1, REVIEW_INTERVALS.length - 1);
          return { ...t, reviewStage: ns, lastReviewDate: todayStr, nextReviewDate: t.scheduledDates[ns] || null, reviewHistory: history };
        }
        if (action === "partial") return { ...t, lastReviewDate: todayStr, reviewHistory: history };
        return { ...t, reviewHistory: history };
      })
    }));
  }, [updateData]);

  const handleRename = useCallback((id, newName) => {
    updateData(prev => ({ ...prev, topics: prev.topics.map(t => t.id === id ? { ...t, name: newName } : t) }));
  }, [updateData]);

  const handleUpdateNotes = useCallback((id, notes) => {
    updateData(prev => ({ ...prev, topics: prev.topics.map(t => t.id === id ? { ...t, notes } : t) }));
  }, [updateData]);

  const handleDelete = useCallback((id) => {
    updateData(prev => ({ ...prev, topics: prev.topics.filter(t => t.id !== id) }));
  }, [updateData]);

  const handleDailyNote = useCallback((field, value) => {
    updateData(prev => ({
      ...prev, dailyNotes: { ...prev.dailyNotes, [selectedDate]: { ...(prev.dailyNotes[selectedDate] || {}), [field]: value } }
    }));
  }, [updateData, selectedDate]);

  const toggleCategory = useCallback((cat) => {
    updateData(prev => ({
      ...prev, collapsedCategories: { ...(prev.collapsedCategories || {}), [cat]: !(prev.collapsedCategories || {})[cat] }
    }));
  }, [updateData]);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "smt2026-backup.json"; a.click(); URL.revokeObjectURL(url);
  };
  const importData = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { try { const imp = JSON.parse(ev.target.result); if (imp.topics) setData({ ...DEFAULT_DATA, ...imp }); } catch {} };
    reader.readAsText(file);
  };

  const todayStr = today();
  const isSelectedToday = selectedDate === todayStr;
  const todayTopics = data.topics.filter(t => t.dateStudied === selectedDate);
  const dueTopics = data.topics.filter(t => t.nextReviewDate && daysBetween(t.nextReviewDate, selectedDate) >= 0 && t.reviewStage < REVIEW_INTERVALS.length);
  const overdueTopics = data.topics.filter(t => t.nextReviewDate && daysBetween(t.nextReviewDate, todayStr) > 0);
  const completedToday = data.topics.filter(t => (t.reviewHistory || []).some(h => h.date === selectedDate && h.action === "reviewed"));
  const avgRetention = data.topics.length > 0 ? Math.round(data.topics.reduce((s, t) => s + calcRetention(t), 0) / data.topics.length) : 0;
  const highRisk = data.topics.filter(t => calcRetention(t) < 40);

  const grouped = useMemo(() => {
    const g = {};
    data.topics.forEach(t => { if (!g[t.category]) g[t.category] = []; g[t.category].push(t); });
    return Object.entries(g).sort(([,a],[,b]) => {
      const avgA = a.reduce((s,t)=>s+calcRetention(t),0)/a.length;
      const avgB = b.reduce((s,t)=>s+calcRetention(t),0)/b.length;
      return avgA - avgB;
    });
  }, [data.topics]);

  const suggestions = useMemo(() => {
    const s = [];
    data.topics.forEach(t => {
      const mr = (t.reviewHistory||[]).slice(-5).filter(h=>h.action==="skipped"||h.action==="missed").length;
      if (mr >= 3) s.push({ text: `"${t.name}" missed ${mr}× recently — consider restarting from Day 1` });
      if (calcRetention(t) >= 90 && t.reviewStage >= 4) s.push({ text: `"${t.name}" holding strong — space reviews further` });
    });
    return s.slice(0, 5);
  }, [data.topics]);

  const filteredTopics = search ? data.topics.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.category.toLowerCase().includes(search.toLowerCase())) : null;
  const dailyNote = data.dailyNotes[selectedDate] || {};

  // Group helper for daily sub-sections
  const groupByCategory = (list) => {
    const g = {};
    list.forEach(t => { if (!g[t.category]) g[t.category] = []; g[t.category].push(t); });
    return Object.entries(g);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0f0f1a; color: #e0e0e0; font-family: 'DM Sans', sans-serif; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        ::selection { background: rgba(139,92,246,0.3); }
        input::placeholder, textarea::placeholder { color: #555; }
        @media (max-width: 860px) {
          .main-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0f0f1a 0%, #151528 100%)" }}>
        <header style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #8b5cf6, #6366f1)", fontSize: 18 }}>📖</div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: "#f0f0f0", fontFamily: "'DM Serif Display', serif", lineHeight: 1.2 }}>Study Memory Tracker</h1>
              <div style={{ fontSize: 11, color: "#666" }}>2026 · Spaced Repetition Dashboard</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search topics..."
              style={{ padding: "6px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#ccc", fontSize: 13, outline: "none", width: 150, fontFamily: "'DM Sans', sans-serif" }} />
            <button onClick={() => setView("daily")} style={navBtn(view==="daily")}><BookIcon size={15}/> Daily</button>
            <button onClick={() => setView("calendar")} style={navBtn(view==="calendar")}><CalendarIcon size={15}/> Calendar</button>
            <button onClick={() => setView("units")} style={navBtn(view==="units")}>🗂️ Units</button>
            <button onClick={() => setShowLogic(true)} style={navBtn(false)}><InfoIcon size={15}/></button>
            <button onClick={exportData} style={navBtn(false)} title="Export"><DownloadIcon size={15}/></button>
            <button onClick={() => fileRef.current?.click()} style={navBtn(false)} title="Import"><UploadIcon size={15}/></button>
            <input ref={fileRef} type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
          </div>
        </header>

        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 24px" }}>
          {/* Stats bar */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 24 }}>
            {[
              ["Total", data.topics.length, "#8b5cf6"], ["Due Today", dueTopics.length, "#eab308"],
              ["Overdue", overdueTopics.length, "#ef4444"], ["Done Today", completedToday.length, "#22c55e"],
              ["Avg Ret.", `${avgRetention}%`, avgRetention >= 60 ? "#22c55e" : "#eab308"],
              ["High Risk", highRisk.length, "#ef4444"], ["Streak", `${data.streak}d`, "#f97316"],
              ["Units", grouped.length, "#8b5cf6"],
            ].map(([l,v,c]) => (
              <div key={l} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: c, fontFamily: "'Space Mono', monospace" }}>{v}</div>
                <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          {filteredTopics && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, color: "#aaa", marginBottom: 10 }}>Search: {filteredTopics.length} result(s)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredTopics.map(t => <TopicCard key={t.id} topic={t} onAction={handleAction} onClick={() => setDetailTopic(t.id)} onRename={handleRename} />)}
              </div>
            </div>
          )}

          {/* ─── UNITS VIEW ─── */}
          {!filteredTopics && view === "units" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: "#f0f0f0" }}>All Units & Subtopics</h2>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => updateData(prev => {
                    const all = {}; grouped.forEach(([c]) => all[c] = false);
                    return { ...prev, collapsedCategories: all };
                  })} style={tinyBtn}>Expand All</button>
                  <button onClick={() => updateData(prev => {
                    const all = {}; grouped.forEach(([c]) => all[c] = true);
                    return { ...prev, collapsedCategories: all };
                  })} style={tinyBtn}>Collapse All</button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 24 }}>
                {grouped.map(([cat, topics]) => {
                  const avg = Math.round(topics.reduce((s,t) => s + calcRetention(t), 0) / topics.length);
                  const rs = getRetentionStatus(avg);
                  return (
                    <div key={cat} onClick={() => toggleCategory(cat)} style={{
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 12, padding: "12px 14px", cursor: "pointer", transition: "all 0.2s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.06)"}
                    onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,0.03)"}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 20 }}>{CAT_ICONS[cat] || "📌"}</span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "#ddd" }}>{cat}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: rs.color, fontFamily: "'Space Mono', monospace" }}>{avg}%</span>
                        <span style={{ fontSize: 11, color: "#777" }}>{topics.length} subtopic{topics.length !== 1 ? "s" : ""}</span>
                      </div>
                      <RetentionBar value={avg} height={6} />
                    </div>
                  );
                })}
              </div>

              {grouped.map(([cat, topics]) => (
                <CategoryGroup key={cat} category={cat} topics={topics}
                  collapsed={!!(data.collapsedCategories || {})[cat]}
                  onToggle={() => toggleCategory(cat)}
                  onAction={handleAction}
                  onClickTopic={(id) => setDetailTopic(id)}
                  onRename={handleRename} />
              ))}
            </div>
          )}

          {/* ─── DAILY VIEW ─── */}
          {!filteredTopics && view === "daily" && (
            <div className="main-grid" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <button onClick={() => setSelectedDate(addDays(selectedDate, -1))} style={{ background:"none",border:"none",color:"#aaa",cursor:"pointer" }}><ChevronLeft /></button>
                  <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: "#f0f0f0" }}>{isSelectedToday ? "Today" : fmtDateFull(selectedDate)}</h2>
                  <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} style={{ background:"none",border:"none",color:"#aaa",cursor:"pointer" }}><ChevronRight /></button>
                  {!isSelectedToday && <button onClick={() => setSelectedDate(todayStr)} style={{ padding:"4px 12px",background:"rgba(139,92,246,0.15)",color:"#a78bfa",border:"1px solid rgba(139,92,246,0.3)",borderRadius:8,fontSize:12,cursor:"pointer" }}>Today</button>}
                </div>

                {/* Topics learned - grouped */}
                <section style={{ marginBottom: 28 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "#a78bfa", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <BookIcon size={16} color="#a78bfa" /> Topics Learned {isSelectedToday ? "Today" : `on ${fmtDate(selectedDate)}`}
                    <span style={{ fontSize: 12, color: "#666", fontWeight: 400 }}>({todayTopics.length})</span>
                  </h3>
                  <AddTopicForm onAdd={addTopic} selectedDate={selectedDate} />
                  {groupByCategory(todayTopics).map(([cat, ts]) => (
                    <div key={cat} style={{ marginTop: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>{CAT_ICONS[cat] || "📌"}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#888" }}>{cat}</span>
                        <span style={{ fontSize: 11, color: "#555" }}>— avg {Math.round(ts.reduce((s,t) => s + calcRetention(t), 0) / ts.length)}%</span>
                      </div>
                      {ts.map(t => <div key={t.id} style={{ marginBottom: 6 }}><TopicCard topic={t} onAction={handleAction} onClick={() => setDetailTopic(t.id)} onRename={handleRename} /></div>)}
                    </div>
                  ))}
                </section>

                {/* Due - grouped */}
                <section style={{ marginBottom: 28 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "#eab308", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <ClockIcon size={16} color="#eab308" /> Due for Review <span style={{ fontSize: 12, color: "#666", fontWeight: 400 }}>({dueTopics.length})</span>
                  </h3>
                  {dueTopics.length === 0 && <div style={{ color: "#555", fontSize: 13, padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 10 }}>No reviews due. 🎯</div>}
                  {groupByCategory(dueTopics).map(([cat, ts]) => (
                    <div key={cat} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>{CAT_ICONS[cat] || "📌"}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#888" }}>{cat}</span>
                        <span style={{ fontSize: 11, color: "#555" }}>— avg {Math.round(ts.reduce((s,t) => s + calcRetention(t), 0) / ts.length)}%</span>
                      </div>
                      {ts.map(t => <div key={t.id} style={{ marginBottom: 6 }}><TopicCard topic={t} onAction={handleAction} onClick={() => setDetailTopic(t.id)} onRename={handleRename} /></div>)}
                    </div>
                  ))}
                </section>

                {isSelectedToday && overdueTopics.length > 0 && (
                  <section style={{ marginBottom: 28 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: "#ef4444", marginBottom: 12 }}>⚠ Overdue ({overdueTopics.length})</h3>
                    {overdueTopics.map(t => <div key={t.id} style={{ marginBottom: 6 }}><TopicCard topic={t} onAction={handleAction} onClick={() => setDetailTopic(t.id)} onRename={handleRename} /></div>)}
                  </section>
                )}

                <section style={{ marginBottom: 28 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "#38bdf8", marginBottom: 12 }}>📝 What I Learned Today</h3>
                  <textarea value={dailyNote.learned || ""} onChange={e => handleDailyNote("learned", e.target.value)}
                    placeholder="Free notes on what you studied today..."
                    style={{ width: "100%", minHeight: 80, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#ccc", padding: 12, fontSize: 13, resize: "vertical", fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "#38bdf8", marginBottom: 8, marginTop: 16 }}>🔗 Extra Points Added to Old Topics</h3>
                  <textarea value={dailyNote.extras || ""} onChange={e => handleDailyNote("extras", e.target.value)}
                    placeholder="New connections, corrections, or additions..."
                    style={{ width: "100%", minHeight: 60, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#ccc", padding: 12, fontSize: 13, resize: "vertical", fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                </section>
              </div>

              {/* Sidebar */}
              <aside>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18, marginBottom: 16 }}>
                  <CalendarView month={calMonth} topics={data.topics} selectedDate={selectedDate} onSelectDate={setSelectedDate} onChangeMonth={d => setCalMonth(m => Math.max(0, Math.min(11, m + d)))} />
                </div>

                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18, marginBottom: 16 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: "#f0f0f0", marginBottom: 12, fontFamily: "'DM Serif Display', serif" }}>📊 Unit Health</h4>
                  {grouped.map(([cat, topics]) => {
                    const avg = Math.round(topics.reduce((s,t) => s + calcRetention(t), 0) / topics.length);
                    const rs = getRetentionStatus(avg);
                    return (
                      <div key={cat} style={{ marginBottom: 10, cursor: "pointer" }} onClick={() => setView("units")}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <span style={{ fontSize: 12, color: "#bbb", display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 13 }}>{CAT_ICONS[cat] || "📌"}</span> {cat}
                            <span style={{ fontSize: 10, color: "#666" }}>({topics.length})</span>
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: rs.color, fontFamily: "'Space Mono', monospace" }}>{avg}%</span>
                        </div>
                        <RetentionBar value={avg} height={5} />
                      </div>
                    );
                  })}
                </div>

                {suggestions.length > 0 && (
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 18 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: "#f0f0f0", marginBottom: 10, fontFamily: "'DM Serif Display', serif" }}>💡 Suggestions</h4>
                    {suggestions.map((s, i) => <div key={i} style={{ fontSize: 12, color: "#aaa", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", lineHeight: 1.5 }}>{s.text}</div>)}
                  </div>
                )}
              </aside>
            </div>
          )}

          {/* ─── CALENDAR VIEW ─── */}
          {!filteredTopics && view === "calendar" && (
            <div>
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 24, maxWidth: 600, margin: "0 auto" }}>
                <CalendarView month={calMonth} topics={data.topics} selectedDate={selectedDate}
                  onSelectDate={(d) => { setSelectedDate(d); setView("daily"); }}
                  onChangeMonth={d => setCalMonth(m => Math.max(0, Math.min(11, m + d)))} />
              </div>
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 16, fontFamily: "'DM Serif Display', serif", color: "#f0f0f0", marginBottom: 14 }}>All Topics by Unit</h3>
                {grouped.map(([cat, topics]) => (
                  <CategoryGroup key={cat} category={cat} topics={topics}
                    collapsed={!!(data.collapsedCategories || {})[cat]}
                    onToggle={() => toggleCategory(cat)}
                    onAction={handleAction}
                    onClickTopic={(id) => setDetailTopic(id)}
                    onRename={handleRename} />
                ))}
              </div>
            </div>
          )}
        </div>

        <footer style={{ textAlign: "center", padding: "24px 0", borderTop: "1px solid rgba(255,255,255,0.04)", marginTop: 40 }}>
          <div style={{ fontSize: 11, color: "#444" }}>
            Study Memory Tracker 2026 · Retention estimates are for study planning, not scientific claims ·{" "}
            <button onClick={() => setShowLogic(true)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>How it works</button>
          </div>
        </footer>
      </div>

      {detailTopic && (() => {
        const t = data.topics.find(x => x.id === detailTopic);
        if (!t) return null;
        return <TopicDetail topic={t} onClose={() => setDetailTopic(null)} onAction={handleAction} onUpdateNotes={handleUpdateNotes} onDelete={handleDelete} onRename={handleRename} />;
      })()}
      {showLogic && <LogicExplainer onClose={() => setShowLogic(false)} />}
    </>
  );
}

const navBtn = (active) => ({
  display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
  background: active ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.04)",
  border: active ? "1px solid rgba(139,92,246,0.3)" : "1px solid rgba(255,255,255,0.06)",
  borderRadius: 8, color: active ? "#a78bfa" : "#999", fontSize: 13,
  fontWeight: 500, cursor: "pointer", transition: "all 0.15s"
});
const tinyBtn = {
  padding: "4px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, color: "#999", fontSize: 11, cursor: "pointer"
};
