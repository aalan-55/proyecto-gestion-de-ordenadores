import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";
import { apiRequest } from "../utils/apiClient.js";

function startOfMonth(dateLike) {
  const d = new Date(dateLike);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(dateLike, months) {
  const d = new Date(dateLike);
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function monthKey(dateLike) {
  const d = new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthDiff(fromDate, toDate) {
  const a = new Date(fromDate);
  const b = new Date(toDate);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export default function AdminCalendarPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [monthWindowOffset, setMonthWindowOffset] = useState(0);
  const [selectedMonthKey, setSelectedMonthKey] = useState("");
  const [selectedWeekStart, setSelectedWeekStart] = useState("");
  const [weekCursor, setWeekCursor] = useState(() => new Date());
  const [currentMonthKey, setCurrentMonthKey] = useState(() => monthKey(new Date()));

  const [reserveRequests, setReserveRequests] = useState([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState("");
  const [handleNote, setHandleNote] = useState("");
  const [handleDevice, setHandleDevice] = useState("");

  const pollInFlightRef = useRef(false);

  const [selectedDayKey, setSelectedDayKey] = useState(null);
  const [selectedDayPage, setSelectedDayPage] = useState(1);
  const selectedDayPageSize = 5;

  const [historyUser, setHistoryUser] = useState(null);
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const toLocalDateKey = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const parseDateKey = (key) => {
    const parts = String(key || "").split("-");
    if (parts.length !== 3) return null;
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (!y || !m || !d) return null;
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
    const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
    return { dayStart, dayEnd };
  };

  const loadUsers = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/users", { token });
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "No se pudo cargar la información de usuarios.");
    } finally {
      setLoading(false);
    }
  };

  const loadDevices = async () => {
    if (!token) return;
    try {
      const data = await apiRequest("/pc-count", { token });
      setDevices(Array.isArray(data) ? data : []);
    } catch {
      // no bloqueamos la página si fallan los equipos
      setDevices([]);
    }
  };

  useEffect(() => {
    loadUsers();
    loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadHistoryForUser = async (userName) => {
    if (!token || !userName) return;
    setHistoryError("");
    setHistoryLoading(true);
    setHistoryUser(userName);
    setHistoryEntries([]);
    try {
      const data = await apiRequest(
        `/users/history?userName=${encodeURIComponent(userName)}`,
        { token }
      );
      setHistoryEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      setHistoryError(err.message || "No se pudo cargar el historial.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const startOfIsoWeek = (dateLike) => {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = mid.getDay();
    const diff = (day + 6) % 7;
    mid.setDate(mid.getDate() - diff);
    return mid;
  };

  const endOfIsoWeek = (weekStart) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  const weekStart = useMemo(() => startOfIsoWeek(weekCursor), [weekCursor]);
  const weekEnd = useMemo(() => (weekStart ? endOfIsoWeek(weekStart) : null), [weekStart]);

  const monthWindowStart = useMemo(
    () => startOfMonth(addMonths(new Date(), monthWindowOffset)),
    [monthWindowOffset]
  );
  const monthWindowEnd = useMemo(
    () => new Date(addMonths(monthWindowStart, 4).getTime() - 1),
    [monthWindowStart]
  );

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 4 }).map((_, idx) => {
        const date = addMonths(monthWindowStart, idx);
        const key = monthKey(date);
        const label = date.toLocaleDateString("es-ES", {
          month: "long",
          year: "numeric"
        });
        return {
          idx,
          key,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          date
        };
      }),
    [monthWindowStart]
  );

  const weekOptions = useMemo(() => {
    const firstMonday = startOfIsoWeek(monthWindowStart);
    if (!firstMonday) return [];
    const out = [];
    const cursor = new Date(firstMonday);
    while (cursor <= monthWindowEnd) {
      const ws = new Date(cursor);
      const we = endOfIsoWeek(ws);
      if (we >= monthWindowStart && ws <= monthWindowEnd) {
        const wsKey = toLocalDateKey(ws);
        const mKey = monthKey(ws);
        const mLabelRaw = ws.toLocaleDateString("es-ES", {
          month: "long",
          year: "numeric"
        });
        const mLabel = mLabelRaw.charAt(0).toUpperCase() + mLabelRaw.slice(1);
        out.push({
          value: wsKey,
          monthKey: mKey,
          label: `${ws.toLocaleDateString("es-ES")} — ${we.toLocaleDateString("es-ES")} (${mLabel})`,
          weekStart: ws
        });
      }
      cursor.setDate(cursor.getDate() + 7);
    }
    return out;
  }, [monthWindowStart, monthWindowEnd]);

  const dropdownWeekOptions = useMemo(() => weekOptions, [weekOptions]);

  useEffect(() => {
    const updateCurrentMonth = () => setCurrentMonthKey(monthKey(new Date()));
    updateCurrentMonth();
    const id = setInterval(updateCurrentMonth, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!monthOptions.length) return;
    const isCurrentInWindow = monthOptions.some((m) => m.key === currentMonthKey);
    const thirdMonthKey = monthOptions[2]?.key || "";

    if (currentMonthKey === thirdMonthKey) {
      const nextOffset = monthWindowOffset + 3;
      const nextStart = startOfMonth(addMonths(new Date(), nextOffset));
      setMonthWindowOffset(nextOffset);
      setSelectedMonthKey(monthKey(nextStart));
      return;
    }

    if (isCurrentInWindow) {
      setSelectedMonthKey(currentMonthKey);
    } else {
      const diff = monthDiff(startOfMonth(new Date()), monthWindowStart);
      if (diff !== 0) {
        setMonthWindowOffset(0);
      }
      setSelectedMonthKey(monthOptions[0]?.key || "");
    }
  }, [currentMonthKey, monthOptions, monthWindowOffset, monthWindowStart]);

  useEffect(() => {
    const first = monthOptions[0]?.key || "";
    if (!monthOptions.some((m) => m.key === selectedMonthKey)) {
      setSelectedMonthKey(first);
    }
  }, [monthOptions, selectedMonthKey]);

  useEffect(() => {
    if (!dropdownWeekOptions.length) {
      setSelectedWeekStart("");
      return;
    }
    const selected = dropdownWeekOptions.find((w) => w.value === selectedWeekStart);
    const preferredFromCurrentMonth =
      dropdownWeekOptions.find((w) => w.monthKey === selectedMonthKey) ||
      dropdownWeekOptions[0];
    const target = selected || preferredFromCurrentMonth;
    setSelectedWeekStart(target.value);
    setWeekCursor(target.weekStart);
  }, [dropdownWeekOptions, selectedWeekStart, selectedMonthKey]);

  const weekDays = useMemo(() => {
    if (!weekStart) return [];
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      out.push(d);
    }
    return out;
  }, [weekStart]);

  const weekLabel = useMemo(() => {
    if (!weekStart || !weekEnd) return "Semana";
    const a = weekStart.toLocaleDateString("es-ES");
    const b = weekEnd.toLocaleDateString("es-ES");
    return `Semana: ${a} — ${b}`;
  }, [weekStart, weekEnd]);

  const reservationsThisWeek = useMemo(() => {
    if (!weekStart || !weekEnd) return [];
    return (users || [])
      .filter((u) => u.level !== 1)
      .map((u) => {
        const start = u.reservationStart ? new Date(u.reservationStart) : null;
        const end = u.reservationEnd ? new Date(u.reservationEnd) : null;
        const s = start && !Number.isNaN(start.getTime()) ? start : null;
        const e = end && !Number.isNaN(end.getTime()) ? end : null;
        if (!s || !e) return null;
        // solapa con la semana
        if (e < weekStart || s > weekEnd) return null;
        return {
          user: u.username || u.email,
          email: u.email,
          device: u.device || null,
          reason: u.reservationRequest?.reason || "",
          adminNote: u.reservationRequest?.adminNote || "",
          status: u.reservationRequest?.status || "NONE",
          start: s,
          end: e
        };
      })
      .filter(Boolean);
  }, [users, weekStart, weekEnd]);

  const dayReservations = useMemo(() => {
    if (!weekStart || !weekEnd) return new Map();
    const map = new Map(); // yyyy-mm-dd -> Set(names)
    const keyOf = (d) => toLocalDateKey(d);

    for (const r of reservationsThisWeek) {
      const from = r.start > weekStart ? r.start : weekStart;
      const to = r.end < weekEnd ? r.end : weekEnd;
      const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());

      while (cursor <= last) {
        const k = keyOf(cursor);
        if (!map.has(k)) map.set(k, new Set());
        map.get(k).add(r.user);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return map;
  }, [reservationsThisWeek, weekStart, weekEnd, toLocalDateKey]);

  const deviceCounts = useMemo(() => {
    const map = new Map();
    for (const r of reservationsThisWeek) {
      const key = r.device || "Sin equipo";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [reservationsThisWeek]);

  const selectedDayReservations = useMemo(() => {
    if (!selectedDayKey) return [];
    const parsed = parseDateKey(selectedDayKey);
    if (!parsed) return [];
    const { dayStart, dayEnd } = parsed;

    return reservationsThisWeek
      .filter((r) => r.start <= dayEnd && r.end >= dayStart)
      .map((r) => ({
        user: r.user,
        device: r.device,
        reason: r.reason || "",
        adminNote: r.adminNote || "",
        status: r.status || "NONE",
        start: r.start,
        end: r.end
      }))
      .sort((a, b) => String(a.user).localeCompare(String(b.user)));
  }, [selectedDayKey, reservationsThisWeek]);

  useEffect(() => {
    setSelectedDayPage(1);
  }, [selectedDayKey]);

  const selectedDayTotalPages = Math.max(
    1,
    Math.ceil(selectedDayReservations.length / selectedDayPageSize)
  );
  const selectedDaySafePage = Math.min(selectedDayPage, selectedDayTotalPages);
  const selectedDayReservationsPaged = selectedDayReservations.slice(
    (selectedDaySafePage - 1) * selectedDayPageSize,
    selectedDaySafePage * selectedDayPageSize
  );

  const loadReserveRequests = async () => {
    if (!token) return;
    setReqLoading(true);
    setReqError("");
    try {
      const data = await apiRequest("/reserve/requests", { token });
      setReserveRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      setReqError(err.message || "No se pudieron cargar las solicitudes.");
    } finally {
      setReqLoading(false);
    }
  };

  useEffect(() => {
    loadReserveRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;

    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        await loadReserveRequests();
      } finally {
        pollInFlightRef.current = false;
      }
    };

    const id = setInterval(tick, 5000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleReserveDecision = async (userName, action, reqWeekStart) => {
    if (!token || !userName) return;
    setReqError("");
    try {
      await apiRequest(`/reserve/handle/${encodeURIComponent(userName)}`, {
        method: "POST",
        token,
        body: {
          action,
          adminNote: handleNote || "",
          deviceId: handleDevice || ""
        }
      });
      setHandleNote("");
      setHandleDevice("");
      if (reqWeekStart) {
        const d = new Date(reqWeekStart);
        if (!Number.isNaN(d.getTime())) setWeekCursor(d);
      }
      await loadReserveRequests();
      await loadUsers();
      if (historyUser) {
        await loadHistoryForUser(historyUser);
      }
    } catch (err) {
      setReqError(err.message || "No se pudo procesar la solicitud.");
    }
  };

  const makeHandleLink = (userName) => {
    const base = window.location.origin;
    return `${base}/panel-admin/solicitud/${encodeURIComponent(userName)}`;
  };

  if (!user || user.level !== 1) {
    return (
      <div className="page centered">
        <p>Acceso solo permitido al administrador.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="card">
        <h1>Gestión</h1>
        <p className="subtitle">
          Vista semanal con reservas y solicitudes. (16 reservas/semana por aforo total).
        </p>
        <div style={{ marginBottom: "0.7rem" }}>
          <button
            type="button"
            className="btn-outline"
            onClick={() => navigate("/panel-admin/actividad")}
          >
            Ir al panel de monitorización de dispositivos
          </button>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="manejo-header">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", flex: 1 }}>
            <div className="form-field" style={{ margin: 0 }}>
              <span>Semana visible (mes + inicio + fin)</span>
              <select
                className="admin-native-select"
                value={selectedWeekStart}
                onChange={(e) => {
                  const wk = dropdownWeekOptions.find((w) => w.value === e.target.value);
                  setSelectedWeekStart(e.target.value);
                  if (wk?.monthKey) setSelectedMonthKey(wk.monthKey);
                  if (wk?.weekStart) setWeekCursor(wk.weekStart);
                }}
                disabled={dropdownWeekOptions.length === 0}
              >
                {dropdownWeekOptions.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="calendar-month">{weekLabel}</span>
          </div>
          <button
            className="btn-primary manejo-refresh"
            type="button"
            onClick={loadUsers}
            disabled={loading}
          >
            {loading ? "Cargando..." : "Refrescar"}
          </button>
        </div>

        <div className="grid-2" style={{ marginTop: "0.75rem" }}>
          <div className="info-block">
            <h2>Resumen</h2>
            <p>
              Total reservas esta semana: <strong>{reservationsThisWeek.length}</strong>
            </p>
            {deviceCounts.length > 0 ? (
              <ul className="info-list">
                {deviceCounts.map(([dev, count]) => (
                  <li key={dev}>
                    <strong>{dev}:</strong> {count}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="subtitle">No hay reservas esta semana.</p>
            )}
          </div>
          <div className="info-block">
            <h2>Días de la semana</h2>
            <div className="week-grid">
              {weekDays.map((d) => {
                const key = toLocalDateKey(d);
                const names = Array.from(dayReservations.get(key) || []);
                const labelDay = d.toLocaleDateString("es-ES", { weekday: "long" });
                const labelDate = d.toLocaleDateString("es-ES", {
                  day: "2-digit",
                  month: "2-digit"
                });
                return (
                  <div
                    key={key}
                    className={`week-day-card${
                      selectedDayKey === key ? " selected" : ""
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedDayKey(key);
                      setSelectedDayPage(1);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setSelectedDayKey(key);
                        setSelectedDayPage(1);
                      }
                    }}
                  >
                    <div className="week-day-top">
                      <div className="week-day-name">{labelDay}</div>
                      <div className="week-day-date">{labelDate}</div>
                    </div>
                    <div className="week-day-body">
                      {names.length === 0 ? (
                        <div className="week-day-empty">Sin reservas</div>
                      ) : (
                        <>
                          <div className="week-day-count">
                            Reservas: <strong>{names.length}</strong>
                          </div>
                          <div className="week-day-users">
                            {names.join(" & ")}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedDayKey ? (
              <div
                className="modal-backdrop"
                onClick={() => setSelectedDayKey(null)}
                role="presentation"
              >
                <div
                  className="modal"
                  onClick={(e) => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                >
                  <div className="modal-header">
                    <h3 style={{ margin: 0, fontSize: "1rem" }}>
                      Reservas del día{" "}
                      {(() => {
                        const parsed = parseDateKey(selectedDayKey);
                        if (!parsed) return "";
                        return parsed.dayStart.toLocaleDateString("es-ES");
                      })()}
                    </h3>
                    <button
                      type="button"
                      className="btn-outline modal-close-btn"
                      onClick={() => setSelectedDayKey(null)}
                    >
                      Cerrar
                    </button>
                  </div>

                  <p className="subtitle" style={{ marginTop: "0.35rem" }}>
                    Mostrando {selectedDayReservationsPaged.length} de{" "}
                    {selectedDayReservations.length} reservas (página{" "}
                    {selectedDaySafePage}).
                  </p>

                  {selectedDayReservations.length === 0 ? (
                    <p className="subtitle">No hay reservas en este día.</p>
                  ) : (
                    <ul className="info-list" style={{ marginTop: "0.4rem" }}>
                      {selectedDayReservationsPaged.map((r, idx) => (
                        <li key={`${r.email || r.user}-${idx}`}>
                          <strong>{r.user}</strong> —{" "}
                          {r.device ? r.device : "Sin asignar"}
                        </li>
                      ))}
                    </ul>
                  )}

                  {selectedDayReservations.length > 0 ? (
                    <div className="users-pagination">
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() =>
                          setSelectedDayPage((p) => Math.max(p - 1, 1))
                        }
                        disabled={selectedDaySafePage === 1}
                      >
                        {"<"}
                      </button>
                      <span className="users-page-info">
                        Página {selectedDaySafePage} de {selectedDayTotalPages}
                      </span>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() =>
                          setSelectedDayPage((p) =>
                            Math.min(p + 1, selectedDayTotalPages)
                          )
                        }
                        disabled={selectedDaySafePage >= selectedDayTotalPages}
                      >
                        {">"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Reservas de la semana</h2>
        <p className="subtitle">
          Listado de usuarios con reserva que solapa con la semana seleccionada.
        </p>
        <div className="users-table-wrapper">
          <table className="users-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Equipo asignado</th>
                <th>Inicio reserva</th>
                <th>Fin reserva</th>
              </tr>
            </thead>
            <tbody>
              {reservationsThisWeek.length === 0 && (
                <tr>
                  <td colSpan={4}>No hay reservas en esta semana.</td>
                </tr>
              )}
              {reservationsThisWeek.map((r) => (
                <tr key={r.email || r.user}>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => loadHistoryForUser(r.user)}
                    >
                      {r.user}
                    </button>
                  </td>
                  <td>{r.device || "Sin asignar"}</td>
                  <td>{r.start.toLocaleDateString("es-ES")}</td>
                  <td>{r.end.toLocaleDateString("es-ES")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Gestión de solicitudes</h2>
        <p className="subtitle">
          Acepta o rechaza las solicitudes pendientes.
        </p>
        {reqError && <div className="alert alert-error">{reqError}</div>}
        <div className="form inline manejo-requests-bar">
          <button
            type="button"
            className="btn-primary manejo-refresh"
            onClick={loadReserveRequests}
            disabled={reqLoading}
          >
            {reqLoading ? "Cargando..." : "Refrescar solicitudes"}
          </button>
          <label className="form-field" style={{ flex: 1, minWidth: 0 }}>
            <span>Nota (opcional)</span>
            <input
              type="text"
              value={handleNote}
              onChange={(e) => setHandleNote(e.target.value)}
              placeholder="Nota para el estudiante"
            />
          </label>
          <label className="form-field" style={{ flex: 1, minWidth: 0 }}>
            <span>Equipo (solo si el usuario no tiene asignado)</span>
            <input
              type="text"
              value={handleDevice}
              onChange={(e) => setHandleDevice(e.target.value)}
              placeholder="PC-LAB-01"
              list="devices-datalist"
            />
            <datalist id="devices-datalist">
              {(devices || [])
                .map((d) => d.deviceId)
                .filter(Boolean)
                .sort((a, b) => String(a).localeCompare(String(b)))
                .map((id) => (
                  <option key={id} value={id} />
                ))}
            </datalist>
          </label>
        </div>
        {reserveRequests.length === 0 ? (
          <p className="subtitle">No hay solicitudes pendientes.</p>
        ) : (
          <div className="users-table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Semana (inicio)</th>
                  <th>Motivo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reserveRequests.map((u) => {
                  const req = u.reservationRequest || {};
                  const ws = req.weekStart
                    ? new Date(req.weekStart).toLocaleDateString("es-ES")
                    : "—";
                  const userName = u.username || u.email;
                  const link = makeHandleLink(userName);
                  return (
                    <tr key={u.email || u.username}>
                      <td>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => loadHistoryForUser(userName)}
                        >
                          {userName}
                        </button>
                      </td>
                      <td>{ws}</td>
                      <td>{req.reason || "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => handleReserveDecision(userName, "ACCEPT", req.weekStart)}
                          disabled={
                            reqLoading ||
                            (!u.device && !(handleDevice || "").trim())
                          }
                          title={
                            u.device
                              ? "Aceptar solicitud"
                              : (handleDevice || "").trim()
                                ? "Aceptar solicitud"
                                : "Debes indicar un equipo porque el usuario no tiene equipo asignado"
                          }
                        >
                          Aceptar
                        </button>{" "}
                        <button
                          type="button"
                          className="btn-outline danger"
                          onClick={() => handleReserveDecision(userName, "DECLINE", req.weekStart)}
                          disabled={reqLoading}
                        >
                          Rechazar
                        </button>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(link);
                              alert("Enlace copiado al portapapeles.");
                            } catch {
                              window.prompt("Copia este enlace:", link);
                            }
                          }}
                          disabled={reqLoading}
                          style={{ marginLeft: "0.5rem" }}
                        >
                          Copiar enlace
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {historyUser && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setHistoryUser(null);
            setHistoryEntries([]);
            setHistoryError("");
          }}
        >
          <div
            className="modal"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="modal-header">
              <h2>Historial de {historyUser}</h2>
              <button
                type="button"
                className="btn-outline modal-close-btn"
                onClick={() => {
                  setHistoryUser(null);
                  setHistoryEntries([]);
                  setHistoryError("");
                }}
              >
                X
              </button>
            </div>
            <div className="modal-body">
              {historyError ? (
                <div className="alert alert-error">{historyError}</div>
              ) : historyLoading ? (
                <p>Cargando historial...</p>
              ) : historyEntries.length === 0 ? (
                <p className="subtitle">Este usuario no tiene historial.</p>
              ) : (
                <ul className="info-list">
                  {historyEntries.map((h, idx) => (
                    <li key={idx} className="history-entry">
                      {(() => {
                        const statusMap = {
                          ACCEPTED: "ACEPTADA",
                          DECLINED: "RECHAZADA",
                          CANCELLED: "CANCELADA",
                          ACCOUNT_CREATED: "FECHA ALTA"
                        };
                        const statusLabel = statusMap[h.status] || h.status || "—";
                        const isAccountCreated = h.status === "ACCOUNT_CREATED";
                        const deviceLabel = h.device ? h.device : "Sin equipo";
                        return (
                          <>
                            <strong>{statusLabel}</strong>
                            {isAccountCreated ? "" : ` — ${deviceLabel}`}{" "}
                            {h.start && h.end ? (
                              <>
                                {new Date(h.start).toLocaleDateString("es-ES")} —{" "}
                                {new Date(h.end).toLocaleDateString("es-ES")}
                              </>
                            ) : h.start ? (
                              <>{new Date(h.start).toLocaleDateString("es-ES")}</>
                            ) : (
                              <span style={{ color: "#9ca3af" }}>Sin fechas</span>
                            )}
                            {h.reason && !isAccountCreated ? (
                              <div className="text-small">
                                Motivo de solicitud:{" "}
                                <span className="text-success">{h.reason}</span>
                              </div>
                            ) : null}
                            {h.adminNote ? (
                              <div className="text-small">
                                Nota del administrador:{" "}
                                <span className="text-success">{h.adminNote}</span>
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

