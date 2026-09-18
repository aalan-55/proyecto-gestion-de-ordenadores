import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";
import { apiRequest } from "../utils/apiClient.js";

export default function AdminRequestHandlePage() {
  const { token, user } = useAuth();
  const { userId } = useParams();
  const navigate = useNavigate();

  const targetUser = useMemo(() => {
    const raw = String(userId || "").trim();
    return raw ? decodeURIComponent(raw) : "";
  }, [userId]);

  const [note, setNote] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [targetDevice, setTargetDevice] = useState("");
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const [pendingRequest, setPendingRequest] = useState(null);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState("");

  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const [anteproyectoLoading, setAnteproyectoLoading] = useState(false);
  const [anteproyectoError, setAnteproyectoError] = useState("");

  const isInvestigacionRequest = useMemo(() => {
    const project = String(pendingRequest?.project || "").toLowerCase();
    return project.includes("investig");
  }, [pendingRequest]);

  useEffect(() => {
    const loadDevices = async () => {
      if (!token) return;
      try {
        const data = await apiRequest("/pc-count", { token });
        setDevices(Array.isArray(data) ? data : []);
      } catch {
        setDevices([]);
      }
    };
    loadDevices();
  }, [token]);

  useEffect(() => {
    setMsg("");
    setError("");
    setNote("");
    setDeviceId("");
    setTargetDevice("");
  }, [targetUser]);

  useEffect(() => {
    const loadTargetDevice = async () => {
      if (!token || !targetUser) return;
      try {
        const data = await apiRequest("/users", { token });
        const found = (Array.isArray(data) ? data : []).find(
          (u) => u.username === targetUser || u.email === targetUser
        );
        const dev = found?.device ? String(found.device).trim() : "";
        setTargetDevice(dev);
        setDeviceId(dev);
      } catch {
        setTargetDevice("");
      }
    };
    loadTargetDevice();
  }, [token, targetUser]);

  useEffect(() => {
    if (!targetDevice && (!deviceId || !String(deviceId).trim()) && devices.length > 0) {
      const first = devices[0]?.deviceId ? String(devices[0].deviceId).trim() : "";
      if (first) setDeviceId(first);
    }
  }, [devices, targetDevice, deviceId]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!token || !targetUser) return;
      setHistoryError("");
      setHistoryLoading(true);
      setHistoryEntries([]);
      try {
        const data = await apiRequest(
          `/users/history?userName=${encodeURIComponent(targetUser)}`,
          { token }
        );
        setHistoryEntries(Array.isArray(data) ? data : []);
      } catch (err) {
        setHistoryError(err.message || "No se pudo cargar el historial.");
      } finally {
        setHistoryLoading(false);
      }
    };

    loadHistory();
  }, [token, targetUser]);

  useEffect(() => {
    const loadPendingRequest = async () => {
      if (!token || !targetUser) return;
      setPendingError("");
      setPendingLoading(true);
      setPendingRequest(null);
      try {
        const data = await apiRequest("/reserve/requests", { token });
        const list = Array.isArray(data) ? data : [];
        const match = list.find(
          (u) =>
            String(u.username || "").toLowerCase() ===
              String(targetUser).toLowerCase() ||
            String(u.email || "").toLowerCase() ===
              String(targetUser).toLowerCase()
        );
        setPendingRequest(match || null);
      } catch (err) {
        setPendingError(err.message || "No se pudo cargar la solicitud pendiente.");
      } finally {
        setPendingLoading(false);
      }
    };

    loadPendingRequest();
  }, [token, targetUser]);

  const finishAndRedirect = () => {
    navigate("/panel-admin/calendario", { replace: true });
  };

  if (!user || user.level !== 1) {
    return (
      <div className="page centered">
        <p>Acceso solo permitido al administrador.</p>
      </div>
    );
  }

  const handle = async (action) => {
    if (!token) return;
    if (!targetUser) {
      setError("Usuario inválido en la URL.");
      return;
    }
    const needsDevice = !(targetDevice || "").trim();
    if (action === "ACCEPT" && needsDevice && !(deviceId || "").trim()) {
      setError("Debes indicar un equipo para aceptar la solicitud (solo si el usuario no tiene equipo asignado).");
      return;
    }
    setLoading(true);
    setMsg("");
    setError("");
    try {
      await apiRequest(`/reserve/handle/${encodeURIComponent(targetUser)}`, {
        method: "POST",
        token,
        body: {
          action,
          adminNote: note || "",
          deviceId: deviceId || ""
        }
      });
      setMsg(
        action === "ACCEPT"
          ? "Solicitud aceptada correctamente."
          : "Solicitud rechazada correctamente."
      );
      finishAndRedirect();
    } catch (err) {
      setError(err.message || "No se pudo procesar la solicitud.");
    } finally {
      setLoading(false);
    }
  };

  const downloadAnteproyecto = async () => {
    if (!token || !targetUser) return;

    setAnteproyectoError("");
    setAnteproyectoLoading(true);
    try {
      const browserHost =
        typeof window !== "undefined" ? window.location.hostname : "localhost";
      const rawBase =
        import.meta.env.VITE_API_BASE_URL || `http://${browserHost}:3000`;
      const base = String(rawBase).trim().replace(/\/+$/, "");
      const res = await fetch(
        `${base}/anteproyecto/${encodeURIComponent(targetUser)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || "anteproyecto";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setAnteproyectoError(err.message || "No se pudo descargar el anteproyecto.");
    } finally {
      setAnteproyectoLoading(false);
    }
  };

  const visualizeAnteproyecto = async () => {
    if (!token || !targetUser) return;

    setAnteproyectoError("");
    setAnteproyectoLoading(true);
    try {
      const browserHost =
        typeof window !== "undefined" ? window.location.hostname : "localhost";
      const rawBase =
        import.meta.env.VITE_API_BASE_URL || `http://${browserHost}:3000`;
      const base = String(rawBase).trim().replace(/\/+$/, "");
      const res = await fetch(
        `${base}/anteproyecto/${encodeURIComponent(targetUser)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const isPdf = blob.type === "application/pdf";
      const url = URL.createObjectURL(blob);

      if (isPdf) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        // Si no es PDF, forzamos descarga
        const disposition = res.headers.get("Content-Disposition") || "";
        const match = disposition.match(/filename="?([^"]+)"?/i);
        const filename = match?.[1] || "anteproyecto";

        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      setAnteproyectoError(err.message || "No se pudo visualizar el anteproyecto.");
    } finally {
      setAnteproyectoLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>Gestionar solicitud</h2>
          <button
            type="button"
            className="btn-outline modal-close-btn"
            onClick={() => finishAndRedirect()}
          >
            X
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}
          {msg && <div className="alert alert-success">{msg}</div>}

          <div className="info-block">
            <p className="subtitle" style={{ marginBottom: "0.4rem" }}>
              Usuario: <strong>{targetUser || "—"}</strong>
            </p>
            <p className="subtitle" style={{ marginBottom: 0 }}>
              Equipo:{" "}
              <strong>{targetDevice ? targetDevice : "Sin equipo asignado"}</strong>
            </p>
          </div>

          <div className="card" style={{ padding: "1rem 1rem", marginTop: "0.9rem" }}>
            <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
              Datos de la solicitud
            </h2>
            {pendingLoading ? (
              <p className="subtitle">Cargando solicitud...</p>
            ) : pendingError ? (
              <div className="alert alert-error">{pendingError}</div>
            ) : !pendingRequest || !pendingRequest.reservationRequest ? (
              <p className="subtitle">No se encontró la solicitud pendiente.</p>
            ) : (
              (() => {
                const req = pendingRequest.reservationRequest || {};
                const ws = req.weekStart
                  ? new Date(req.weekStart).toLocaleDateString("es-ES")
                  : "—";
                const we = req.weekEnd
                  ? new Date(req.weekEnd).toLocaleDateString("es-ES")
                  : "—";
                return (
                  <>
                    <p className="subtitle" style={{ marginBottom: "0.35rem" }}>
                      Semana: <strong>{ws}</strong> — <strong>{we}</strong>
                    </p>
                    <p className="subtitle" style={{ marginBottom: 0 }}>
                      Motivo: <strong>{req.reason || "—"}</strong>
                    </p>
                  </>
                );
              })()
            )}
          </div>

          <div className="card" style={{ padding: "1rem 1rem", marginTop: "0.9rem" }}>
            <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
              Historial
            </h2>
            {historyError ? (
              <div className="alert alert-error">{historyError}</div>
            ) : historyLoading ? (
              <p className="subtitle">Cargando historial...</p>
            ) : historyEntries.length === 0 ? (
              <p className="subtitle">No hay historial.</p>
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

          {!isInvestigacionRequest ? (
            <div className="card" style={{ padding: "1rem 1rem", marginTop: "0.9rem" }}>
              <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
                Anteproyecto
              </h2>
              {anteproyectoError ? (
                <div className="alert alert-error">{anteproyectoError}</div>
              ) : null}
              <p className="subtitle" style={{ marginBottom: "0.7rem" }}>
                Puedes descargarlo y, si es PDF, visualizarlo directamente.
              </p>
              <div className="form-actions full" style={{ justifyContent: "flex-start" }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={anteproyectoLoading}
                  onClick={downloadAnteproyecto}
                >
                  {anteproyectoLoading ? "Procesando..." : "Descargar"}
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  disabled={anteproyectoLoading}
                  style={{ marginLeft: "0.5rem" }}
                  onClick={visualizeAnteproyecto}
                >
                  {anteproyectoLoading ? "Procesando..." : "Visualizar"}
                </button>
              </div>
            </div>
          ) : null}

          <div className="form grid-2" style={{ marginTop: "1rem" }}>
            <label className="form-field">
              <span>
                Equipo{" "}
                {targetDevice ? "(ya asignado)" : "(obligatorio para aceptar)"}
              </span>
            <select
              className="admin-native-select"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              disabled={loading || !!targetDevice || (devices || []).length === 0}
            >
              {(devices || [])
                .slice()
                .sort((a, b) => String(a.deviceId).localeCompare(String(b.deviceId)))
                .map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.deviceId} ({Number(d.assignedCount || 0)})
                  </option>
                ))}
            </select>
            </label>
            <label className="form-field">
              <span>Nota (opcional)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota para el estudiante"
              />
            </label>

            <div className="form-actions full">
              <button
                type="button"
                className="btn-primary"
                onClick={() => handle("ACCEPT")}
                disabled={
                  loading || (!(targetDevice || "").trim() && !(deviceId || "").trim())
                }
                title={
                  targetDevice
                    ? "Aceptar solicitud"
                    : (deviceId || "").trim()
                      ? "Aceptar solicitud"
                      : "Debes indicar un equipo para aceptar"
                }
              >
                {loading ? "Procesando..." : "Aceptar"}
              </button>
              <button
                type="button"
                className="btn-outline danger"
                onClick={() => handle("DECLINE")}
                disabled={loading}
                style={{ marginLeft: "0.5rem" }}
              >
                {loading ? "Procesando..." : "Rechazar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

