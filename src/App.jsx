import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ScanFace, Fingerprint, ShieldCheck, LayoutDashboard, Users, ClipboardList,
  Settings, LogOut, CheckCircle2, XCircle, Sun, UtensilsCrossed, Moon,
  ChevronRight, Search, Plus, Trash2, Smartphone, Monitor, AlertTriangle,
  Download, Filter, BadgeCheck, Building2, Radar, X, ArrowLeft, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { useAuth } from "./lib/AuthContext.jsx";
import {
  fetchEmployees, insertEmployee, updateEmployeeRow, deleteEmployeeRow,
  fetchLogs, insertLog, fetchDevices, setDeviceActive,
} from "./lib/data.js";
import { WEBAUTHN_SUPPORTED, registerPlatformBiometric, verifyPlatformBiometric } from "./lib/webauthn.js";

const DEPARTMENTS = ["Engineering", "Operations", "Sales", "Finance", "HR"];
const AVATAR_PALETTE = ["#6366F1", "#F59E0B", "#10B981", "#EC4899", "#38BDF8", "#F97316", "#A78BFA", "#34D399"];

const CHECKPOINTS = [
  { key: "morning", label: "Morning In", window: "06:00 – 09:30", icon: Sun },
  { key: "pre_lunch", label: "Before Lunch", window: "11:30 – 13:00", icon: UtensilsCrossed },
  { key: "post_lunch", label: "After Lunch", window: "13:00 – 14:30", icon: UtensilsCrossed },
  { key: "end_of_day", label: "Day Out", window: "17:00 – 20:00", icon: Moon },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function suggestCheckpoint() {
  const h = new Date().getHours();
  if (h < 11) return "morning";
  if (h < 13) return "pre_lunch";
  if (h < 15) return "post_lunch";
  return "end_of_day";
}

/* ---------------------------------------------------------------------- */
/*  UI PRIMITIVES                                                         */
/* ---------------------------------------------------------------------- */

function Avatar({ name, color, size = 40 }) {
  const initials = (name || "?").split(" ").map((n) => n[0]).slice(0, 2).join("");
  return (
    <div className="flex items-center justify-center rounded-full font-semibold text-slate-950 shrink-0"
      style={{ width: size, height: size, background: color || "#6366F1", fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}
function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-800 text-slate-300 border-slate-700",
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    red: "bg-red-500/10 text-red-400 border-red-500/30",
  };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
function Panel({ title, action, children, className = "" }) {
  return (
    <div className={`bg-slate-900/60 border border-slate-800 rounded-lg ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-200 tracking-wide">{title}</h3>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
function StatCard({ label, value, sub, icon: Icon, accent = "#6366F1" }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-5 relative overflow-hidden">
      <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-10" style={{ background: accent }} />
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-slate-500">{label}</span>
        <Icon size={16} style={{ color: accent }} />
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-100">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
function FullLoader({ label = "Loading…" }) {
  return (
    <div className="min-h-full flex items-center justify-center text-slate-500 gap-2 text-sm">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}
function TopBar({ title, subtitle, onExit }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-indigo-400" />
        <div>
          <div className="text-sm font-semibold text-slate-100 leading-tight">{title}</div>
          {subtitle && <div className="text-[11px] text-slate-500 leading-tight">{subtitle}</div>}
        </div>
      </div>
      <button onClick={onExit} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
        <LogOut size={13} /> Exit
      </button>
    </div>
  );
}
function SideNav({ items, active, onSelect, roleLabel }) {
  return (
    <div className="w-56 shrink-0 border-r border-slate-800 bg-slate-950/60 flex flex-col">
      <div className="px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm"><ShieldCheck size={16} /> PulseAMS</div>
        <div className="text-[11px] text-slate-600 mt-0.5">{roleLabel}</div>
      </div>
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {items.map((it) => (
          <button key={it.key} onClick={() => onSelect(it.key)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              active === it.key ? "bg-indigo-500/10 text-indigo-300" : "text-slate-500 hover:text-slate-300 hover:bg-slate-900"
            }`}>
            <it.icon size={15} /> {it.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  LANDING + LOGIN                                                       */
/* ---------------------------------------------------------------------- */

function Landing({ onEnter }) {
  const roles = [
    { key: "kiosk", title: "Attendance Terminal", desc: "Face or fingerprint check-in, walk-up kiosk mode", icon: Radar },
    { key: "employee", title: "Employee Portal", desc: "Your attendance history & biometric enrollment", icon: Users },
    { key: "hr", title: "HR Console", desc: "Attendance records, reports, workforce management", icon: ClipboardList },
    { key: "admin", title: "Admin Console", desc: "Accounts, devices, system configuration", icon: Settings },
  ];
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-16 relative">
      <div className="absolute inset-0 opacity-[0.07]" style={{
        backgroundImage: "linear-gradient(#6366F1 1px, transparent 1px), linear-gradient(90deg, #6366F1 1px, transparent 1px)",
        backgroundSize: "42px 42px",
      }} />
      <div className="relative z-10 text-center mb-12">
        <div className="inline-flex items-center gap-2 text-indigo-400 text-xs font-mono tracking-[0.3em] mb-4">
          <ShieldCheck size={14} /> BIOMETRIC ATTENDANCE NETWORK
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold text-slate-100 tracking-tight">
          Pulse<span className="text-indigo-400">AMS</span>
        </h1>
        <p className="text-slate-500 mt-3 max-w-md mx-auto text-sm">
          Face and fingerprint attendance, four checkpoints a day, verified on phone, laptop or desk sensor.
        </p>
      </div>
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
        {roles.map((r) => (
          <button key={r.key} onClick={() => onEnter(r.key)}
            className="group text-left bg-slate-900/70 border border-slate-800 hover:border-indigo-500/60 rounded-lg p-5 transition-colors">
            <r.icon size={20} className="text-indigo-400 mb-3" />
            <div className="text-slate-100 font-medium flex items-center gap-1">
              {r.title}
              <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400" />
            </div>
            <div className="text-xs text-slate-500 mt-1">{r.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Login({ requiredRole, onBack }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError("Sign-in failed. Check your email and password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-slate-900/70 border border-slate-800 rounded-xl p-6">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mb-4">
          <ArrowLeft size={12} /> Back
        </button>
        <div className="flex items-center gap-2 mb-1 text-indigo-400"><ShieldCheck size={16} /> <span className="text-sm font-semibold">Sign in</span></div>
        <div className="text-xs text-slate-500 mb-5">Required for the {requiredRole} console.</div>
        <div className="space-y-3">
          <input required type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
          <input required type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
        </div>
        {error && <div className="text-xs text-red-400 mt-3">{error}</div>}
        <button type="submit" disabled={busy}
          className="w-full mt-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="text-[11px] text-slate-600 mt-4 text-center">
          Accounts are created by an Admin in the Admin Console (Firebase Authentication).
        </div>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  KIOSK                                                                 */
/* ---------------------------------------------------------------------- */

function Kiosk({ employees, logs, onLogAdded, onExit }) {
  const [step, setStep] = useState("select");
  const [query, setQuery] = useState("");
  const [emp, setEmp] = useState(null);
  const [method, setMethod] = useState(null);
  const [device, setDevice] = useState("phone");
  const [checkpoint, setCheckpoint] = useState(suggestCheckpoint());
  const [result, setResult] = useState(null);
  const videoRef = useRef(null);
  const [camOn, setCamOn] = useState(false);
  const streamRef = useRef(null);

  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(query.toLowerCase()) || e.id.toLowerCase().includes(query.toLowerCase())
  );

  const stopCam = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    setCamOn(false);
  }, []);
  useEffect(() => () => stopCam(), [stopCam]);

  async function startFaceScan() {
    setMethod("face");
    setStep("scanning");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCamOn(true);
    } catch (e) { setCamOn(false); }
    runSimulated();
  }

  async function startFingerScan() {
    setMethod("fingerprint");
    setStep("scanning");
    if (emp.fp_credential_id && WEBAUTHN_SUPPORTED) {
      try {
        await verifyPlatformBiometric(emp.fp_credential_id);
        await finish(true);
      } catch (e) {
        await finish(false, "biometric_failed");
      }
    } else {
      runSimulated();
    }
  }

  async function finish(success, failReason) {
    stopCam();
    if (!success) {
      setResult({ ok: false, reason: failReason || "biometric_failed" });
      setStep("result");
      return;
    }
    const already = logs.some((l) => l.employee_id === emp.id && l.date === todayStr() && l.checkpoint === checkpoint);
    if (already) {
      setResult({ ok: false, reason: "already_logged" });
      setStep("result");
      return;
    }
    const now = new Date();
    const time = now.toTimeString().slice(0, 5);
    try {
      const row = await insertLog({
        employee_id: emp.id,
        date: todayStr(),
        checkpoint,
        time,
        method,
        device: device === "phone" ? "Android Phone – Lobby" : "PC Sensor – Floor 2",
        late: checkpoint === "morning" && now.getHours() >= 9 && now.getMinutes() > 30,
      });
      onLogAdded(row);
      setResult({ ok: true, time });
    } catch (e) {
      setResult({ ok: false, reason: "write_failed" });
    }
    setStep("result");
  }

  function runSimulated() {
    setTimeout(() => {
      const enrolled = method === "face" ? emp.face_enrolled : emp.finger_enrolled;
      finish(enrolled, enrolled ? null : "not_enrolled");
    }, 1800);
  }

  function reset() {
    stopCam(); setStep("select"); setEmp(null); setMethod(null); setResult(null); setQuery(""); setCheckpoint(suggestCheckpoint());
  }

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title="Attendance Terminal" subtitle={device === "phone" ? "Android Phone – Lobby" : "PC Sensor – Floor 2"} onExit={onExit} />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="flex justify-center gap-2 mb-5">
            <DeviceToggle active={device === "phone"} icon={Smartphone} label="Android Phone" onClick={() => setDevice("phone")} />
            <DeviceToggle active={device === "pc"} icon={Monitor} label="PC / Laptop Sensor" onClick={() => setDevice("pc")} />
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 min-h-[420px] flex flex-col">
            {step === "select" && (
              <>
                <div className="text-xs text-slate-500 mb-3 font-mono tracking-wide">STEP 1 — IDENTIFY YOURSELF</div>
                <div className="relative mb-3">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your name or employee ID"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {filtered.map((e) => (
                    <button key={e.id} onClick={() => { setEmp(e); setStep("method"); }}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-800/70 border border-transparent hover:border-slate-700 transition-colors text-left">
                      <Avatar name={e.name} color={e.color} size={34} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-200 truncate">{e.name}</div>
                        <div className="text-[11px] text-slate-500">{e.id} · {e.dept}</div>
                      </div>
                      <ChevronRight size={14} className="text-slate-600" />
                    </button>
                  ))}
                  {filtered.length === 0 && <div className="text-sm text-slate-600 text-center py-8">No match found</div>}
                </div>
              </>
            )}

            {step === "method" && emp && (
              <>
                <button onClick={() => setStep("select")} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mb-3">
                  <ArrowLeft size={12} /> Back
                </button>
                <div className="flex items-center gap-3 mb-5">
                  <Avatar name={emp.name} color={emp.color} size={44} />
                  <div><div className="text-slate-100 font-medium">{emp.name}</div><div className="text-xs text-slate-500">{emp.id} · {emp.dept}</div></div>
                </div>
                <div className="text-xs text-slate-500 mb-2 font-mono tracking-wide">STEP 2 — CHECKPOINT</div>
                <div className="grid grid-cols-4 gap-1.5 mb-5">
                  {CHECKPOINTS.map((c) => (
                    <button key={c.key} onClick={() => setCheckpoint(c.key)}
                      className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] ${
                        checkpoint === c.key ? "border-indigo-500 bg-indigo-500/10 text-indigo-300" : "border-slate-800 text-slate-500 hover:border-slate-700"
                      }`}>
                      <c.icon size={14} /> {c.label}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-slate-500 mb-2 font-mono tracking-wide">STEP 3 — VERIFY BIOMETRIC</div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={startFaceScan} disabled={!emp.face_enrolled}
                    className="flex flex-col items-center gap-2 py-5 rounded-lg border border-slate-800 hover:border-indigo-500 disabled:opacity-30 disabled:hover:border-slate-800 transition-colors">
                    <ScanFace size={26} className="text-indigo-400" /><span className="text-xs text-slate-300">Face Scan</span>
                  </button>
                  <button onClick={startFingerScan} disabled={!emp.finger_enrolled}
                    className="flex flex-col items-center gap-2 py-5 rounded-lg border border-slate-800 hover:border-indigo-500 disabled:opacity-30 disabled:hover:border-slate-800 transition-colors">
                    <Fingerprint size={26} className="text-indigo-400" /><span className="text-xs text-slate-300">Fingerprint</span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-600 mt-3 text-center">Use one method only — face or fingerprint, not both.</div>
              </>
            )}

            {step === "scanning" && (
              <div className="flex-1 flex flex-col items-center justify-center">
                {method === "face" ? (
                  <div className="relative w-48 h-48 rounded-full overflow-hidden border-2 border-indigo-500/60 bg-slate-950 flex items-center justify-center">
                    {camOn ? <video ref={videoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" /> : <ScanFace size={48} className="text-indigo-500 animate-pulse" />}
                    <div className="absolute inset-0 border-t-2 border-indigo-400 animate-scanline" />
                  </div>
                ) : (
                  <div className="relative w-32 h-32 rounded-2xl border-2 border-indigo-500/60 bg-slate-950 flex items-center justify-center">
                    <Fingerprint size={54} className="text-indigo-400 animate-pulse" />
                    <span className="absolute inset-0 rounded-2xl border-2 border-indigo-400 animate-ping opacity-40" />
                  </div>
                )}
                <div className="text-sm text-slate-300 mt-6 font-mono tracking-wide">VERIFYING IDENTITY…</div>
                <div className="text-[11px] text-slate-600 mt-1">Matching against enrolled template</div>
              </div>
            )}

            {step === "result" && result && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                {result.ok ? (
                  <>
                    <CheckCircle2 size={56} className="text-emerald-400 mb-4" />
                    <div className="text-lg text-slate-100 font-medium">Attendance Logged</div>
                    <div className="text-sm text-slate-400 mt-1">{emp.name} · {CHECKPOINTS.find((c) => c.key === checkpoint).label} · {result.time}</div>
                  </>
                ) : (
                  <>
                    <XCircle size={56} className="text-red-400 mb-4" />
                    <div className="text-lg text-slate-100 font-medium">
                      {result.reason === "already_logged" ? "Already Checked In"
                        : result.reason === "biometric_failed" ? "Verification Failed"
                        : result.reason === "write_failed" ? "Connection Error"
                        : "Biometric Not Enrolled"}
                    </div>
                    <div className="text-sm text-slate-400 mt-1 max-w-xs">
                      {result.reason === "already_logged" ? `${CHECKPOINTS.find((c) => c.key === checkpoint).label} was already recorded today.`
                        : result.reason === "biometric_failed" ? "Fingerprint didn't match or the prompt was cancelled. Try again."
                        : result.reason === "write_failed" ? "Couldn't reach the database. Check your connection and try again."
                        : `Ask HR to enroll your ${method} in the employee portal.`}
                    </div>
                  </>
                )}
                <button onClick={reset} className="mt-6 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white transition-colors">Done</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
function DeviceToggle({ active, icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${
      active ? "border-indigo-500 text-indigo-300 bg-indigo-500/10" : "border-slate-800 text-slate-500 hover:border-slate-700"
    }`}>
      <Icon size={13} /> {label}
    </button>
  );
}

/* ---------------------------------------------------------------------- */
/*  HR CONSOLE                                                            */
/* ---------------------------------------------------------------------- */

function HRConsole({ employees, logs, onExit }) {
  const [tab, setTab] = useState("overview");
  const items = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "attendance", label: "Attendance Log", icon: ClipboardList },
    { key: "employees", label: "Employees", icon: Users },
  ];
  const today = todayStr();
  const todayLogs = logs.filter((l) => l.date === today);
  const presentToday = new Set(todayLogs.map((l) => l.employee_id)).size;
  const lateToday = todayLogs.filter((l) => l.late).length;
  const completeToday = employees.filter((e) => CHECKPOINTS.every((c) => todayLogs.some((l) => l.employee_id === e.id && l.checkpoint === c.key))).length;

  const weekData = useMemo(() => {
    const days = [];
    for (let d = 4; d >= 0; d--) {
      const dt = new Date(); dt.setDate(dt.getDate() - d);
      const key = dt.toISOString().slice(0, 10);
      const count = new Set(logs.filter((l) => l.date === key).map((l) => l.employee_id)).size;
      days.push({ day: dt.toLocaleDateString(undefined, { weekday: "short" }), present: count });
    }
    return days;
  }, [logs]);

  const methodSplit = useMemo(() => ([
    { name: "Face", value: logs.filter((l) => l.method === "face").length, color: "#6366F1" },
    { name: "Fingerprint", value: logs.filter((l) => l.method === "fingerprint").length, color: "#F59E0B" },
  ]), [logs]);

  return (
    <div className="min-h-full flex">
      <SideNav items={items} active={tab} onSelect={setTab} roleLabel="HR Console" />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title="HR Console" subtitle="Workforce attendance oversight" onExit={onExit} />
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {tab === "overview" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Present Today" value={`${presentToday}/${employees.length}`} icon={Users} accent="#6366F1" />
                <StatCard label="Late Arrivals" value={lateToday} icon={AlertTriangle} accent="#F59E0B" />
                <StatCard label="4/4 Checkpoints" value={completeToday} icon={BadgeCheck} accent="#10B981" />
                <StatCard label="Departments" value={DEPARTMENTS.length} icon={Building2} accent="#818CF8" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Panel title="Weekly Presence" className="lg:col-span-2">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={weekData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                      <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }} />
                      <Bar dataKey="present" fill="#6366F1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>
                <Panel title="Verification Method">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={methodSplit} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={3}>
                        {methodSplit.map((m, i) => <Cell key={i} fill={m.color} />)}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </Panel>
              </div>
            </>
          )}
          {tab === "attendance" && <AttendanceLogTable employees={employees} logs={logs} />}
          {tab === "employees" && <EmployeeDirectory employees={employees} />}
        </div>
      </div>
    </div>
  );
}

function AttendanceLogTable({ employees, logs }) {
  const [date, setDate] = useState(todayStr());
  const [dept, setDept] = useState("All");
  const empMap = Object.fromEntries(employees.map((e) => [e.id, e]));
  const rows = logs.filter((l) => l.date === date).filter((l) => dept === "All" || empMap[l.employee_id]?.dept === dept).sort((a, b) => a.time.localeCompare(b.time));

  function exportCSV() {
    const header = "Employee ID,Name,Department,Date,Checkpoint,Time,Method,Device\n";
    const body = rows.map((r) => {
      const e = empMap[r.employee_id];
      return [r.employee_id, e?.name, e?.dept, r.date, r.checkpoint, r.time, r.method, r.device].join(",");
    }).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance_${date}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel title="Attendance Log" action={
      <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-200"><Download size={13} /> Export CSV</button>
    }>
      <div className="flex flex-wrap gap-3 mb-4">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500" />
        <select value={dept} onChange={(e) => setDept(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500">
          <option>All</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <span className="flex items-center gap-1 text-xs text-slate-500 ml-auto"><Filter size={12} /> {rows.length} records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-slate-800">
              <th className="py-2 pr-4">Employee</th><th className="py-2 pr-4">Checkpoint</th><th className="py-2 pr-4">Time</th>
              <th className="py-2 pr-4">Method</th><th className="py-2 pr-4">Device</th><th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const e = empMap[r.employee_id];
              const cp = CHECKPOINTS.find((c) => c.key === r.checkpoint);
              return (
                <tr key={r.id} className="border-b border-slate-900 hover:bg-slate-900/40">
                  <td className="py-2.5 pr-4"><div className="flex items-center gap-2"><Avatar name={e?.name} color={e?.color} size={26} /><span className="text-slate-300">{e?.name}</span></div></td>
                  <td className="py-2.5 pr-4 text-slate-400">{cp?.label}</td>
                  <td className="py-2.5 pr-4 font-mono text-slate-300">{r.time}</td>
                  <td className="py-2.5 pr-4 text-slate-400 capitalize flex items-center gap-1">{r.method === "face" ? <ScanFace size={13} /> : <Fingerprint size={13} />} {r.method}</td>
                  <td className="py-2.5 pr-4 text-slate-500 text-xs">{r.device}</td>
                  <td className="py-2.5 pr-4">{r.late ? <Badge tone="amber">Late</Badge> : <Badge tone="green">On time</Badge>}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-slate-600 py-8">No records for this filter</td></tr>}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function EmployeeDirectory({ employees }) {
  const [query, setQuery] = useState("");
  const filtered = employees.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <Panel title="Employee Directory" action={
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search"
          className="bg-slate-950 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500" />
      </div>
    }>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((e) => (
          <div key={e.id} className="border border-slate-800 rounded-lg p-4 flex items-center gap-3">
            <Avatar name={e.name} color={e.color} size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-slate-200 truncate">{e.name}</div>
              <div className="text-[11px] text-slate-500">{e.id} · {e.dept}</div>
              <div className="flex gap-1.5 mt-1.5">
                <Badge tone={e.face_enrolled ? "green" : "red"}><ScanFace size={10} />{e.face_enrolled ? "Face" : "No face"}</Badge>
                <Badge tone={e.finger_enrolled ? "green" : "red"}><Fingerprint size={10} />{e.finger_enrolled ? "Print" : "No print"}</Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------------- */
/*  EMPLOYEE PORTAL                                                       */
/* ---------------------------------------------------------------------- */

function EmployeePortal({ employees, logs, myEmployeeId, onEmployeeUpdated, onExit }) {
  const [empId, setEmpId] = useState(myEmployeeId || employees[0]?.id);
  const emp = employees.find((e) => e.id === empId);
  if (!emp) return <FullLoader label="Loading your profile…" />;
  const myLogs = logs.filter((l) => l.employee_id === empId).sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
  const todayLogs = myLogs.filter((l) => l.date === todayStr());

  async function patch(fields) {
    const row = await updateEmployeeRow(emp.id, fields);
    onEmployeeUpdated(row);
  }

  return (
    <div className="min-h-full flex flex-col">
      <TopBar title="Employee Portal" subtitle={emp.name} onExit={onExit} />
      <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
        {!myEmployeeId && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Viewing as</span>
            <select value={empId} onChange={(e) => setEmpId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-indigo-500">
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        )}

        <Panel title="Today's Checkpoints">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CHECKPOINTS.map((c) => {
              const hit = todayLogs.find((l) => l.checkpoint === c.key);
              return (
                <div key={c.key} className={`rounded-lg border p-3 text-center ${hit ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-800"}`}>
                  <c.icon size={18} className={hit ? "text-emerald-400 mx-auto mb-1" : "text-slate-600 mx-auto mb-1"} />
                  <div className="text-xs text-slate-300">{c.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{hit ? hit.time : "—"}</div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Biometric Enrollment">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <EnrollCard icon={ScanFace} label="Face" enrolled={emp.face_enrolled}
              onEnroll={() => patch({ face_enrolled: true })} onRemove={() => patch({ face_enrolled: false })} />
            <EnrollCard icon={Fingerprint} label="Fingerprint" enrolled={emp.finger_enrolled} employee={emp} useWebAuthn
              onEnroll={(credId) => patch({ finger_enrolled: true, fp_credential_id: credId })}
              onRemove={() => patch({ finger_enrolled: false, fp_credential_id: null })} />
          </div>
          <p className="text-[11px] text-slate-600 mt-3">
            {WEBAUTHN_SUPPORTED
              ? "Fingerprint enrollment triggers your device's real platform prompt — Touch ID, Windows Hello, or Android fingerprint/face unlock — via WebAuthn. Only a signed credential is stored; the raw fingerprint never leaves your device."
              : "This browser doesn't expose a platform authenticator, so fingerprint enrollment falls back to a simulated capture."}
          </p>
        </Panel>

        <Panel title="Attendance History">
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {myLogs.map((l) => {
              const cp = CHECKPOINTS.find((c) => c.key === l.checkpoint);
              return (
                <div key={l.id} className="flex items-center gap-3 py-2 border-b border-slate-900 text-sm">
                  <span className="text-slate-500 w-24 shrink-0 font-mono text-xs">{l.date}</span>
                  <cp.icon size={13} className="text-slate-500" />
                  <span className="text-slate-300 flex-1">{cp.label}</span>
                  <span className="font-mono text-slate-400 text-xs">{l.time}</span>
                  {l.late && <Badge tone="amber">Late</Badge>}
                </div>
              );
            })}
            {myLogs.length === 0 && <div className="text-center text-slate-600 py-8 text-sm">No attendance records yet</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function EnrollCard({ icon: Icon, label, enrolled, onEnroll, onRemove, employee, useWebAuthn }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  async function handle() {
    setScanning(true); setError(null);
    if (useWebAuthn && WEBAUTHN_SUPPORTED && employee) {
      try {
        const credId = await registerPlatformBiometric(employee);
        setScanning(false); onEnroll(credId); return;
      } catch (e) {
        setScanning(false);
        setError("Prompt cancelled or unavailable — enrolling with simulated capture instead.");
      }
    }
    setScanning(true);
    setTimeout(() => { setScanning(false); onEnroll(useWebAuthn ? null : undefined); }, 1400);
  }

  return (
    <div className="border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${enrolled ? "bg-emerald-500/10" : "bg-slate-800"}`}>
            <Icon size={18} className={enrolled ? "text-emerald-400" : "text-slate-500"} />
          </div>
          <div><div className="text-sm text-slate-200">{label}</div><div className="text-[11px] text-slate-500">{enrolled ? "Enrolled" : "Not enrolled"}</div></div>
        </div>
        {enrolled ? (
          <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-300">Reset</button>
        ) : (
          <button onClick={handle} disabled={scanning} className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white disabled:opacity-50">
            {scanning ? "Capturing…" : "Enroll"}
          </button>
        )}
      </div>
      {error && <div className="text-[11px] text-amber-400 mt-2">{error}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  ADMIN CONSOLE                                                         */
/* ---------------------------------------------------------------------- */

function AdminConsole({ employees, onEmployeesChanged, devices, onDevicesChanged, onExit }) {
  const [tab, setTab] = useState("users");
  const items = [
    { key: "users", label: "User Accounts", icon: Users },
    { key: "devices", label: "Devices", icon: Monitor },
    { key: "settings", label: "System Settings", icon: Settings },
  ];
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", dept: DEPARTMENTS[0], role: "Staff" });
  const [busy, setBusy] = useState(false);

  async function addEmployee() {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const id = `EMP-${1000 + employees.length + 1}`;
      const row = await insertEmployee({
        id, name: form.name, dept: form.dept, role: form.role,
        color: AVATAR_PALETTE[employees.length % AVATAR_PALETTE.length],
        face_enrolled: false, finger_enrolled: false, fp_credential_id: null,
        status: "Active", joined: todayStr(),
      });
      onEmployeesChanged([...employees, row]);
      setForm({ name: "", dept: DEPARTMENTS[0], role: "Staff" });
      setShowAdd(false);
    } finally { setBusy(false); }
  }

  async function removeEmployee(id) {
    await deleteEmployeeRow(id);
    onEmployeesChanged(employees.filter((e) => e.id !== id));
  }

  async function toggleDevice(d) {
    const row = await setDeviceActive(d.id, !d.active);
    onDevicesChanged(devices.map((x) => (x.id === d.id ? row : x)));
  }

  return (
    <div className="min-h-full flex">
      <SideNav items={items} active={tab} onSelect={setTab} roleLabel="Admin Console" />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title="Admin Console" subtitle="Accounts, devices & configuration" onExit={onExit} />
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {tab === "users" && (
            <Panel title="User Accounts" action={
              <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg">
                <Plus size={13} /> Add Employee
              </button>
            }>
              {showAdd && (
                <div className="mb-4 border border-slate-800 rounded-lg p-4 bg-slate-950/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-mono tracking-wide">NEW EMPLOYEE</span>
                    <button onClick={() => setShowAdd(false)}><X size={14} className="text-slate-500" /></button>
                  </div>
                  <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
                  <div className="flex gap-3">
                    <select value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500">
                      {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                    <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500">
                      <option>Staff</option><option>Team Lead</option><option>Manager</option>
                    </select>
                  </div>
                  <button onClick={addEmployee} disabled={busy} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm">
                    {busy ? "Creating…" : "Create Account"}
                  </button>
                  <div className="text-[11px] text-slate-600">
                    This creates the employee record in Supabase. To let them sign in, also create a Firebase Authentication
                    user for their email and add a matching row to the <code>profiles</code> table (see README).
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                {employees.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 py-2 border-b border-slate-900">
                    <Avatar name={e.name} color={e.color} size={32} />
                    <div className="flex-1 min-w-0"><div className="text-sm text-slate-200">{e.name}</div><div className="text-[11px] text-slate-500">{e.id} · {e.dept} · {e.role}</div></div>
                    <Badge tone="green">{e.status}</Badge>
                    <button onClick={() => removeEmployee(e.id)} className="text-slate-600 hover:text-red-400 p-1"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {tab === "devices" && (
            <Panel title="Registered Devices">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {devices.map((d) => (
                  <div key={d.id} className="border border-slate-800 rounded-lg p-4 flex items-center gap-3">
                    {d.type === "phone" ? <Smartphone size={20} className="text-indigo-400" /> : <Monitor size={20} className="text-indigo-400" />}
                    <div className="flex-1"><div className="text-sm text-slate-200">{d.name}</div><div className="text-[11px] text-slate-500">{d.location} · {d.type === "phone" ? "Face + fingerprint" : "Fingerprint sensor"}</div></div>
                    <button onClick={() => toggleDevice(d)} className={`text-xs px-2.5 py-1 rounded-full border ${d.active ? "border-emerald-500/40 text-emerald-400" : "border-slate-700 text-slate-500"}`}>
                      {d.active ? "Online" : "Disabled"}
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {tab === "settings" && (
            <Panel title="Checkpoint Windows">
              <div className="space-y-2">
                {CHECKPOINTS.map((c) => (
                  <div key={c.key} className="flex items-center gap-3 py-2.5 border-b border-slate-900">
                    <c.icon size={16} className="text-indigo-400" /><span className="text-sm text-slate-200 flex-1">{c.label}</span>
                    <span className="font-mono text-xs text-slate-500">{c.window}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-600 mt-4">Windows are currently fixed in code (App.jsx). Move them to a `settings` table if you want HR/Admin to edit them live.</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  ROOT APP                                                              */
/* ---------------------------------------------------------------------- */

export default function App() {
  const { user, profile, loading: authLoading, logout } = useAuth();
  const [screen, setScreen] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [logs, setLogs] = useState([]);
  const [devices, setDevices] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState(null);

  const needsAuth = screen === "hr" || screen === "admin" || screen === "employee";

  useEffect(() => {
    if (!screen) return;
    if (needsAuth && !user) return; // Login gate handles this screen
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    Promise.all([fetchEmployees(), fetchLogs(), fetchDevices()])
      .then(([e, l, d]) => { if (!cancelled) { setEmployees(e); setLogs(l); setDevices(d); } })
      .catch((err) => { if (!cancelled) setDataError(err.message || "Failed to load data"); })
      .finally(() => { if (!cancelled) setDataLoading(false); });
    return () => { cancelled = true; };
  }, [screen, needsAuth, user]);

  function exit() { setScreen(null); }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200" style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      {screen === null && <Landing onEnter={setScreen} />}

      {screen && needsAuth && authLoading && <FullLoader label="Checking session…" />}

      {screen && needsAuth && !authLoading && !user && (
        <Login requiredRole={screen} onBack={exit} />
      )}

      {screen && needsAuth && !authLoading && user && profile && profile.role !== screen && screen !== "employee" && (
        <div className="min-h-full flex flex-col items-center justify-center text-center px-6">
          <AlertTriangle size={32} className="text-amber-400 mb-3" />
          <div className="text-slate-200 font-medium">Your account doesn't have {screen.toUpperCase()} access</div>
          <div className="text-sm text-slate-500 mt-1">Signed in as {user.email} ({profile.role})</div>
          <div className="flex gap-3 mt-5">
            <button onClick={exit} className="text-xs px-4 py-2 border border-slate-700 rounded-lg text-slate-300">Back</button>
            <button onClick={logout} className="text-xs px-4 py-2 bg-indigo-600 rounded-lg text-white">Sign out</button>
          </div>
        </div>
      )}

      {screen === "kiosk" && (
        dataLoading ? <FullLoader label="Loading roster…" /> :
        dataError ? <ErrorState message={dataError} onExit={exit} /> :
        <Kiosk employees={employees} logs={logs} onLogAdded={(row) => setLogs((p) => [row, ...p])} onExit={exit} />
      )}

      {screen === "hr" && user && profile?.role === "hr" && (
        dataLoading ? <FullLoader label="Loading dashboard…" /> :
        dataError ? <ErrorState message={dataError} onExit={exit} /> :
        <HRConsole employees={employees} logs={logs} onExit={exit} />
      )}

      {screen === "admin" && user && profile?.role === "admin" && (
        dataLoading ? <FullLoader label="Loading console…" /> :
        dataError ? <ErrorState message={dataError} onExit={exit} /> :
        <AdminConsole
          employees={employees} onEmployeesChanged={setEmployees}
          devices={devices} onDevicesChanged={setDevices} onExit={exit}
        />
      )}

      {screen === "employee" && user && profile && (
        dataLoading ? <FullLoader label="Loading your data…" /> :
        dataError ? <ErrorState message={dataError} onExit={exit} /> :
        <EmployeePortal
          employees={employees} logs={logs} myEmployeeId={profile.employee_id}
          onEmployeeUpdated={(row) => setEmployees((p) => p.map((e) => (e.id === row.id ? row : e)))}
          onExit={exit}
        />
      )}
    </div>
  );
}

function ErrorState({ message, onExit }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center text-center px-6">
      <AlertTriangle size={32} className="text-red-400 mb-3" />
      <div className="text-slate-200 font-medium">Couldn't load data</div>
      <div className="text-sm text-slate-500 mt-1 max-w-sm">{message}</div>
      <button onClick={onExit} className="mt-5 text-xs px-4 py-2 border border-slate-700 rounded-lg text-slate-300">Back</button>
    </div>
  );
}
