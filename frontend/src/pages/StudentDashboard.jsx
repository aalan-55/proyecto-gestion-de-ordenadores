import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
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

function startOfIsoWeek(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - diff);
  return local;
}

function endOfIsoWeek(weekStart) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d;
}

function toYmd(dateLike) {
  const d = new Date(dateLike);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

export default function StudentDashboard() {
  const { user, token, fetchMe, changePassword } = useAuth();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState(user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pw, setPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMessage, setPwMessage] = useState("");
  const [view, setView] = useState("inicio"); // "inicio" | "perfil"
  const didLoadRef = useRef(false);

  const [reserveReason, setReserveReason] = useState("");
  const [reserveWeek, setReserveWeek] = useState("");
  const [reserveWeekEnd, setReserveWeekEnd] = useState("");
  const [reserveMonthName, setReserveMonthName] = useState("");

  const [deviceStats, setDeviceStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [monthWindowOffset, setMonthWindowOffset] = useState(0);
  const [selectedMonthKey, setSelectedMonthKey] = useState("");
  const [currentMonthKey, setCurrentMonthKey] = useState(() => monthKey(new Date()));
  const [reserveLoading, setReserveLoading] = useState(false);
  const [reserveMsg, setReserveMsg] = useState("");

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    if (location?.state?.view === "perfil") {
      setView("perfil");
    } else {
      setView("inicio");
    }
  }, [location?.state?.view]);

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;

    const load = async () => {
      // mostramos lo que haya en memoria al instante
      if (user) setCurrentUser(user);

      try {
        const me = await fetchMe();
        if (me) setCurrentUser(me);
      } catch (err) {
        setError(err.message || "No se pudieron cargar tus datos.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [fetchMe, user]);

  const fetchDeviceStats = useCallback(async () => {
    if (!token || !currentUser?.device) return;
    setStatsLoading(true);
    try {
      // Consultamos el endpoint de telemetría para el dispositivo del alumno
      const data = await apiRequest("/device-activity/my-device", { token });
      setDeviceStats(data);
    } catch (err) {
      console.error("No se pudo cargar la telemetría:", err);
    } finally {
      setStatsLoading(false);
    }
  }, [token, currentUser?.device]);

  useEffect(() => {
    if (view === "inicio" && currentUser?.device) {
      fetchDeviceStats();
      const interval = setInterval(fetchDeviceStats, 30000); // Refresco cada 30s
      return () => clearInterval(interval);
    }
  }, [view, currentUser?.device, fetchDeviceStats]);

  const formatDateEs = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const raw = d.toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwMessage("");
    setError("");
    setPwLoading(true);
    try {
      await changePassword(pw);
      setPwMessage("Contraseña actualizada correctamente.");
      setPw("");
    } catch (err) {
      setError(err.message || "No se pudo cambiar la contraseña.");
    } finally {
      setPwLoading(false);
    }
  };

  const formatPercent = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? `${Math.round(n * 10) / 10}%` : "—";
  };

  const getRingStyle = (percent, color) => {
    const p = Number.isFinite(Number(percent)) ? Math.max(0, Math.min(100, Number(percent))) : 0;
    return {
      background: `conic-gradient(${color} ${p}%, rgba(180, 205, 226, 0.3) ${p}% 100%)`
    };
  };

  const formatDateShortEs = (value) => {
    if (!value) return "Sin fecha";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Sin fecha";
    return d.toLocaleDateString("es-ES");
  };

  const loadMyHistory = async () => {
    if (!token) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const data = await apiRequest("/reserve/my-history", { token });
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      setHistoryError(err.message || "No se pudo cargar tu historial.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const monthWindowStart = useMemo(
    () => startOfMonth(addMonths(new Date(), monthWindowOffset)),
    [monthWindowOffset]
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
          key,
          idx,
          date,
          label: label.charAt(0).toUpperCase() + label.slice(1)
        };
      }),
    [monthWindowStart]
  );

  useEffect(() => {
    const firstKey = monthOptions[0]?.key || "";
    const exists = monthOptions.some((m) => m.key === selectedMonthKey);
    if (!exists) setSelectedMonthKey(firstKey);
  }, [monthOptions, selectedMonthKey]);

  useEffect(() => {
    const updateCurrentMonth = () => setCurrentMonthKey(monthKey(new Date()));
    updateCurrentMonth();
    const id = setInterval(updateCurrentMonth, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!monthOptions.length) return;
    const isCurrentInWindow = monthOptions.some((m) => m.key === currentMonthKey);
    
    // Siempre intentamos que el selector comience en el mes actual
    setMonthWindowOffset(0);
    if (isCurrentInWindow) {
      setSelectedMonthKey(currentMonthKey);
    } else {
      setSelectedMonthKey(monthOptions[0]?.key || "");
    }
  }, [currentMonthKey, monthOptions, monthWindowOffset, monthWindowStart]);

  const weeklyOptions = useMemo(() => {
    const rangeStart = new Date(monthWindowStart);
    const rangeEnd = new Date(addMonths(monthWindowStart, 12).getTime() - 1);
    const firstMonday = startOfIsoWeek(rangeStart);
    if (!firstMonday) return [];

    const out = [];
    const cursor = new Date(firstMonday);
    while (cursor <= rangeEnd) {
      const weekStart = new Date(cursor);
      const weekEnd = endOfIsoWeek(weekStart);
      if (weekEnd >= rangeStart && weekStart <= rangeEnd) {
        const wkStart = toYmd(weekStart);
        const wkEnd = toYmd(weekEnd);
        const monthLabelRaw = weekStart.toLocaleDateString("es-ES", {
          month: "long",
          year: "numeric"
        });
        const monthLabel =
          monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);
        out.push({
          value: wkStart,
          weekStart: wkStart,
          weekEnd: wkEnd,
          monthName: monthLabel,
          monthKey: monthKey(weekStart),
          label: `${weekStart.toLocaleDateString("es-ES")} — ${weekEnd.toLocaleDateString("es-ES")} (${monthLabel})`
        });
      }
      cursor.setDate(cursor.getDate() + 7);
    }
    return out;
  }, [monthWindowStart]);

  const dropdownWeekOptions = useMemo(() => {
    return weeklyOptions.filter((w) => w.monthKey === selectedMonthKey);
  }, [weeklyOptions, selectedMonthKey]);

  useEffect(() => {
    if (dropdownWeekOptions.length === 0) {
      setReserveWeek("");
      setReserveWeekEnd("");
      setReserveMonthName("");
      return;
    }
    // Si la semana que estaba seleccionada no pertenece al nuevo mes, 
    // seleccionamos la primera disponible del mes actual.
    const selected = dropdownWeekOptions.find((w) => w.value === reserveWeek) || dropdownWeekOptions[0];

    setReserveWeek(selected.value);
    setReserveWeekEnd(selected.weekEnd);
    setReserveMonthName(selected.monthName);
  }, [dropdownWeekOptions, reserveWeek]);

  const renderWeekSelector = () => (
    <>
      <div className="month-selector-tabs" style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '1rem', 
        flexWrap: 'wrap',
        padding: '4px 0'
      }}>
        {monthOptions.map((m) => (
          <button
            key={m.key}
            type="button"
            className={selectedMonthKey === m.key ? "btn-primary" : "btn-outline"}
            style={{ whiteSpace: 'nowrap', padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            onClick={() => setSelectedMonthKey(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <label className="form-field">
        <span>Selecciona la semana de {reserveMonthName}</span>
        {dropdownWeekOptions.length === 0 ? (
          <p className="subtitle" style={{ margin: 0 }}>
            No hay semanas disponibles para este mes.
          </p>
        ) : null}
        <select
          value={reserveWeek}
          onChange={(e) => {
            const selected = dropdownWeekOptions.find(
              (w) => w.value === e.target.value
            );
            if (selected) {
              setReserveWeek(selected.value);
              setReserveWeekEnd(selected.weekEnd);
              setReserveMonthName(selected.monthName);
            }
          }}
          required
          disabled={dropdownWeekOptions.length === 0}
        >
          {dropdownWeekOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label.split(" (")[0]}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  const submitReserveRequest = async (e) => {
    e.preventDefault();
    setReserveMsg("");
    setError("");
    if (!token) {
      setError("No hay sesión activa.");
      return;
    }
    if (!reserveWeek) {
      setError("Selecciona una semana válida.");
      return;
    }
    if (!reserveReason.trim()) {
      setError("Indica el motivo de la reserva.");
      return;
    }

    setReserveLoading(true);
    try {
      await apiRequest("/reserve/request", {
        method: "POST",
        token,
        body: {
          reason: reserveReason.trim(),
          reserve: reserveWeek,
          reserveWeekEnd,
          monthName: reserveMonthName
        }
      });
      setReserveMsg("Solicitud enviada. Queda pendiente de revisión del administrador.");
      setReserveReason("");
      // recargar usuario
      const me = await fetchMe();
      if (me) setCurrentUser(me);
      await loadMyHistory();
    } catch (err) {
      setError(err.message || "No se pudo enviar la solicitud.");
    } finally {
      setReserveLoading(false);
    }
  };

  const cancelReserveRequest = async () => {
    setReserveMsg("");
    setError("");
    if (!token) {
      setError("No hay sesión activa.");
      return;
    }
    setReserveLoading(true);
    try {
      await apiRequest("/reserve/request", {
        method: "DELETE",
        token
      });
      setReserveMsg("Solicitud cancelada.");
      const me = await fetchMe();
      if (me) setCurrentUser(me);
      await loadMyHistory();
    } catch (err) {
      setError(err.message || "No se pudo cancelar la solicitud.");
    } finally {
      setReserveLoading(false);
    }
  };

  const cancelAcceptedReservation = async () => {
    setReserveMsg("");
    setError("");
    if (!token) {
      setError("No hay sesión activa.");
      return;
    }
    setReserveLoading(true);
    try {
      await apiRequest("/reserve/cancel", {
        method: "DELETE",
        token
      });
      setReserveMsg("Reserva cancelada.");
      const me = await fetchMe();
      if (me) setCurrentUser(me);
      await loadMyHistory();
    } catch (err) {
      setError(err.message || "No se pudo cancelar la reserva.");
    } finally {
      setReserveLoading(false);
    }
  };

  useEffect(() => {
    loadMyHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) {
    return (
      <div className="page centered">
        <p>Cargando tu panel...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="page centered">
        <p>No se pudieron cargar tus datos.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="card">
        <h1>
          {view === "perfil"
            ? `Perfil de ${currentUser.username}`
            : "Inicio"}
        </h1>
        <p className="subtitle">
          {view === "perfil"
            ? "Gestiona tu perfil y tu contraseña."
            : "Resumen del estado y del equipo asignado."}
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="grid-2">
          {view === "perfil" ? (
            <>
              <div className="info-block">
                <h2>Datos personales</h2>
                <ul className="info-list">
                  <li>
                    <strong>Usuario:</strong> {currentUser.username}
                  </li>
                  <li>
                    <strong>Correo:</strong> {currentUser.email}
                  </li>
                  <li>
                    <strong>Curso:</strong> {currentUser.course}
                  </li>
                  <li>
                    <strong>Proyecto:</strong> {currentUser.project}
                  </li>
                  {currentUser.motives ? (
                    <li>
                      <strong>Motivos:</strong> {currentUser.motives}
                    </li>
                  ) : null}
                </ul>
              </div>
            </>
          ) : (
            <>
              <div className="info-block">
                <h2>Equipo asignado</h2>
                {currentUser.device ? (
                  <p>
                    Se te ha asignado el equipo:{" "}
                    <strong>{currentUser.device}</strong>
                  </p>
                ) : (
                  <p>
                    Aún no tienes un equipo asignado. El administrador te lo
                    asignará cuando esté disponible.
                  </p>
                )}

                {currentUser.device && (
                  <div className="device-stats-student" style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Rendimiento del equipo</h3>
                      <button onClick={fetchDeviceStats} disabled={statsLoading} className="btn-outline" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                        {statsLoading ? "..." : "↻"}
                      </button>
                    </div>
                    
                    {deviceStats && deviceStats.current ? (
                      <div>
                        <p><strong>CPU:</strong> {formatPercent(deviceStats.current.cpuUsage)}</p>
                        <p><strong>GPU:</strong> {formatPercent(deviceStats.current.gpuUsage)}</p>
                        <p><strong>RAM:</strong> {formatPercent(deviceStats.current.memoryUsage)}</p>
                      </div>
                    ) : (
                      <p className="subtitle" style={{ fontSize: '0.8rem', textAlign: 'center' }}>
                        {statsLoading ? "Actualizando..." : "Esperando datos de telemetría..."}
                      </p>
                    )}
                  </div>
                )}
                {currentUser.reservationStart || currentUser.reservationEnd ? (
                  <div className="reservation-box">
                    {(() => {
                      const startLabel = formatDateEs(
                        currentUser.reservationStart
                      );
                      const endLabel = formatDateEs(
                        currentUser.reservationEnd
                      );

                      let estado = "Sin información";
                      const now = new Date();
                      const startDate = currentUser.reservationStart
                        ? new Date(currentUser.reservationStart)
                        : null;
                      const endDate = currentUser.reservationEnd
                        ? new Date(currentUser.reservationEnd)
                        : null;

                      if (startDate && endDate) {
                        if (now < startDate) estado = "Futura";
                      else if (now >= endDate) estado = "Finalizada";
                        else estado = "Activa";
                      } else if (startDate && !endDate) {
                        estado = now >= startDate ? "Activa" : "Futura";
                      }

                      return (
                        <>
                          <p className="reservation-line">
                            <strong>Estado:</strong> {estado}
                          </p>
                          <p className="reservation-line">
                            <strong>Inicio:</strong>{" "}
                            {startLabel || "Sin fecha de inicio"}
                          </p>
                          <p className="reservation-line">
                            <strong>Fin:</strong>{" "}
                            {endLabel || "Sin fecha de fin"}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
              </div>
              <div className="info-block">
                <h2>Solicitud de reserva semanal</h2>
                {reserveMsg && <div className="alert alert-success">{reserveMsg}</div>}
                {(() => {
                  const req = currentUser.reservationRequest || {};
                  const status = req.status || "NONE";
                  const weekLabel =
                    req.weekStart ? formatDateEs(req.weekStart) : null;

                  const now = new Date();
                  const acceptedEndRaw = req.weekEnd || currentUser.reservationEnd;
                  const acceptedEnd =
                    acceptedEndRaw && !Number.isNaN(new Date(acceptedEndRaw).getTime())
                      ? new Date(acceptedEndRaw)
                      : null;
                  const isAcceptedFinalized =
                    status === "ACCEPTED" && acceptedEnd
                      ? now >= acceptedEnd
                      : false;

                  if (status === "PENDING") {
                    return (
                      <>
                        <p>
                          Tienes una solicitud <strong>pendiente</strong>
                          {weekLabel ? (
                            <>
                              {" "}
                              para la semana de <strong>{weekLabel}</strong>
                            </>
                          ) : null}
                          .
                        </p>
                        {req.adminNote ? (
                          <p className="subtitle">
                            Nota del administrador: {req.adminNote}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          className="btn-outline danger"
                          onClick={cancelReserveRequest}
                          disabled={reserveLoading}
                        >
                          {reserveLoading ? "Cancelando..." : "Cancelar solicitud"}
                        </button>
                      </>
                    );
                  }

                  if (status === "ACCEPTED") {
                    if (isAcceptedFinalized) {
                      return (
                        <>
                          <p>
                            Tu reserva está <strong>finalizada</strong>. Puedes solicitar otra.
                          </p>
                          {req.deviceId ? (
                            <p>
                              Equipo asignado: <strong>{req.deviceId}</strong>
                            </p>
                          ) : null}
                          {req.adminNote ? (
                            <p className="subtitle">
                              Nota del administrador: {req.adminNote}
                            </p>
                          ) : null}
                          <form onSubmit={submitReserveRequest} className="form">
                            {renderWeekSelector()}
                            <label className="form-field">
                              <span>Motivo</span>
                              <input
                                type="text"
                                value={reserveReason}
                                onChange={(e) => setReserveReason(e.target.value)}
                                placeholder="Ej: avance del proyecto, prácticas, etc."
                                required
                              />
                            </label>
                            <button
                              type="submit"
                              className="btn-primary"
                              disabled={reserveLoading}
                            >
                              {reserveLoading ? "Enviando..." : "Solicitar reserva"}
                            </button>
                          </form>
                        </>
                      );
                    }
                    return (
                      <>
                        <p>
                          Tu solicitud está <strong>aceptada</strong>.
                        </p>
                        {req.deviceId ? (
                          <p>
                            Equipo asignado: <strong>{req.deviceId}</strong>
                          </p>
                        ) : null}
                        {req.adminNote ? (
                          <p className="subtitle">
                            Nota del administrador: {req.adminNote}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          className="btn-outline danger"
                          onClick={cancelAcceptedReservation}
                          disabled={reserveLoading}
                        >
                          {reserveLoading ? "Cancelando..." : "Cancelar reserva"}
                        </button>
                      </>
                    );
                  }

                  if (status === "DECLINED") {
                    return (
                      <>
                        <p>
                          Tu solicitud fue <strong>rechazada</strong>.
                        </p>
                        {req.adminNote ? (
                          <p className="subtitle">
                            Motivo/nota del administrador: {req.adminNote}
                          </p>
                        ) : null}

                        <form onSubmit={submitReserveRequest} className="form">
                          {renderWeekSelector()}
                          <label className="form-field">
                            <span>Motivo</span>
                            <input
                              type="text"
                              value={reserveReason}
                              onChange={(e) =>
                                setReserveReason(e.target.value)
                              }
                              placeholder="Ej: avance del proyecto, prácticas, etc."
                              required
                            />
                          </label>
                          <button
                            type="submit"
                            className="btn-primary"
                            disabled={reserveLoading}
                          >
                            {reserveLoading ? "Enviando..." : "Solicitar reserva"}
                          </button>
                        </form>
                      </>
                    );
                  }

                  return (
                    <form onSubmit={submitReserveRequest} className="form">
                      {renderWeekSelector()}
                      <label className="form-field">
                        <span>Motivo</span>
                        <input
                          type="text"
                          value={reserveReason}
                          onChange={(e) => setReserveReason(e.target.value)}
                          placeholder="Ej: avance del proyecto, prácticas, etc."
                          required
                        />
                      </label>
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={reserveLoading}
                      >
                        {reserveLoading ? "Enviando..." : "Solicitar reserva"}
                      </button>
                    </form>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </section>
      {view !== "perfil" && (
        <section className="card">
          <h2>Historial</h2>
          <p className="subtitle">Aquí tienes tus reservas, solicitudes y fecha de alta.</p>
          {historyError && <div className="alert alert-error">{historyError}</div>}
          {historyLoading ? (
            <p className="subtitle">Cargando historial...</p>
          ) : history.length === 0 ? (
            <p className="subtitle">Aún no tienes historial de reservas.</p>
          ) : (
            <ul className="info-list">
              {(history || []).map((h, idx) => (
                <li key={idx} className="history-entry" style={{
                  color: (() => {
                    const now = new Date();
                    if (h.status === 'ACCEPTED' && h.start && h.end && now >= new Date(h.start) && now <= new Date(h.end)) return '#28a745';
                    return 'inherit';
                  })(),
                  textDecoration: (() => {
                    const now = new Date();
                    const isAccepted = h.status === 'ACCEPTED';
                    const isAccount = h.status === 'ACCOUNT_CREATED';
                    if (isAccount) return 'none';
                    if (isAccepted) {
                      const start = h.start ? new Date(h.start) : null;
                      const end = h.end ? new Date(h.end) : null;
                      if (start && now < start) return 'none';
                      if (start && end && now >= start && now <= end) return 'none';
                    }
                    return 'line-through';
                  })()
                }}>
                  {(() => {
                    const statusMap = {
                      ACCEPTED: "ACEPTADA",
                      DECLINED: "RECHAZADA",
                      CANCELLED: "CANCELADA",
                      ACCOUNT_CREATED: "FECHA ALTA"
                    };
                    const statusLabel = statusMap[h.status] || h.status || "—";
                    const isAccountCreated = h.status === "ACCOUNT_CREATED";
                    const deviceLabel = h.device ? h.device : "Equipo no asignado";
                    return (
                      <>
                        <strong>{statusLabel}</strong>
                        {isAccountCreated ? null : <> — {deviceLabel}</>}
                        {h.start ? (
                          <>
                            {" "}
                            {isAccountCreated
                              ? formatDateShortEs(h.start)
                              : `${formatDateShortEs(h.start)} — ${formatDateShortEs(h.end)}`}
                          </>
                        ) : null}
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
        </section>
      )}
      {view === "perfil" && (
        <section className="card">
          <h2>Cambiar contraseña</h2>
          <form onSubmit={handlePasswordChange} className="form inline">
            <label className="form-field">
              <span>Nueva contraseña</span>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Nueva contraseña"
                required
              />
            </label>
            <button type="submit" className="btn-primary" disabled={pwLoading}>
              {pwLoading ? "Actualizando..." : "Actualizar contraseña"}
            </button>
          </form>
          {pwMessage && <div className="alert alert-success">{pwMessage}</div>}
        </section>
      )}
    </div>
  );
}
