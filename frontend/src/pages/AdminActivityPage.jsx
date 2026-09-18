import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../state/AuthContext.jsx";
import { apiRequest } from "../utils/apiClient.js";

function formatPercent(value) {
  if (value === undefined || value === null) return "0%";
  const n = Number(value);
  if (Number.isNaN(n) || !Number.isFinite(n)) return "0%";
  // Forzamos el rango 0-100 y redondeamos a un decimal
  const safe = Math.max(0, Math.min(100, n));
  return `${(Math.round(safe * 10) / 10).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return "Sin datos";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Sin datos";
  return d.toLocaleString("es-ES");
}

export default function AdminActivityPage() {
  const { token, user } = useAuth();
  const socketRef = useRef(null);
  const debounceRef = useRef(null);

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [socketState, setSocketState] = useState("connecting");
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [modalTab, setModalTab] = useState("current"); // "current" | "history"
  const [historyDisplayLimit, setHistoryDisplayLimit] = useState(10); // Default to 10 entries
  const [timeScale, setTimeScale] = useState("raw"); // "raw" | "daily" | "weekly" | "monthly"
  const [startDate, setStartDate] = useState(null);
  const [selectedDeviceHistory, setSelectedDeviceHistory] = useState(null); // To store detailed history of the selected device
  const [endDate, setEndDate] = useState(null);
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const loadSummary = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const queryParams = new URLSearchParams();
      if (startDate) queryParams.append('startDate', startDate.toISOString());
      if (endDate) queryParams.append('endDate', endDate.toISOString());

      const url = `/device-activity/summary?${queryParams.toString()}`;

      const summary = await apiRequest(url, { token });
      setData(Array.isArray(summary?.devices) ? summary.devices : []);
    } catch (err) {
      setError(err.message || "No se pudo cargar la actividad de dispositivos.");
    } finally {
      setLoading(false);
    }
  }, [token, startDate, endDate]);

  const loadSelectedDeviceHistory = useCallback(async (deviceId) => {
    if (!token || !deviceId) {
      setSelectedDeviceHistory(null);
      return;
    }
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('deviceId', deviceId); // Request history for specific device
      if (startDate) queryParams.append('startDate', startDate.toISOString());
      if (endDate) queryParams.append('endDate', endDate.toISOString());

      const url = `/device-activity/summary?${queryParams.toString()}`;
      const summary = await apiRequest(url, { token });
      const deviceData = Array.isArray(summary?.devices) ? summary.devices[0] : null;
      setSelectedDeviceHistory(deviceData);
    } catch (err) {
      console.error("Error loading selected device history:", err);
      setSelectedDeviceHistory(null); // Clear history on error
    }
  }, [token, startDate, endDate]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!token) return undefined;
    const rawBase = import.meta.env.VITE_API_BASE_URL || window.location.origin;
    const wsBase = String(rawBase).replace(/^http/i, "ws").replace(/\/+$/, "");
    const ws = new WebSocket(
      `${wsBase}/ws/activity?role=admin&token=${encodeURIComponent(token)}`
    );
    socketRef.current = ws;

    ws.onopen = () => setSocketState("connected");
    ws.onclose = () => setSocketState("closed");
    ws.onerror = () => setSocketState("error");
    ws.onmessage = (event) => {
      let msg = null;
      try {
        msg = JSON.parse(String(event?.data || "{}"));
      } catch {
        return;
      }
      if (
        msg?.type === "telemetry_update" ||
        msg?.type === "device_online" ||
        msg?.type === "device_offline"
      ) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          // Refrescamos la lista completa para reflejar el nuevo estado de conexión
          loadSummary();
        }, 150);
      }
    };

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }, [token, loadSummary]);

  useEffect(() => {
    if (selectedDeviceId) {
      loadSelectedDeviceHistory(selectedDeviceId);
    } else {
      setSelectedDeviceHistory(null); // Clear when no device is selected
    }
  }, [selectedDeviceId, loadSelectedDeviceHistory]);

  const refreshNow = async (specificDeviceId = null) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError("Socket no conectado. Recarga la página.");
      return;
    }

    setRefreshing(true);
    setError("");
    try {
      // Registramos la solicitud en el backend para que quede constancia en el historial
      const targetId = specificDeviceId || selectedDeviceId;
      if (targetId) {
        await apiRequest("/refresh-log", {
          method: "POST",
          token,
          body: { deviceId: targetId }
        }).catch(() => { /* log silencioso si falla */ });
      }

      const requestId = String(Date.now());
      // Enviamos el requestId y, si existe, el deviceId específico
      ws.send(JSON.stringify({ type: "request_latest", requestId, deviceId: specificDeviceId }));
      
      setTimeout(async () => {
        try {
          await loadSummary();
        } finally {
          setRefreshing(false);
        }
      }, 1800);
    } catch (err) {
      setError("Error al enviar comando al equipo.");
      setRefreshing(false);
    }
  };

  const totalOnline = useMemo(
    () => data.filter((d) => d.online).length,
    [data]
  );

  const selectedDevice = useMemo(
    () => data.find((d) => d.deviceId === selectedDeviceId) || null,
    [data, selectedDeviceId, selectedDeviceHistory] // Add selectedDeviceHistory as dependency
  );

  // Merge the summary data with the detailed history if available
  const fullSelectedDevice = useMemo(
    () => {
      if (selectedDeviceHistory && selectedDeviceHistory.deviceId === selectedDeviceId) {
        return { ...selectedDevice, ...selectedDeviceHistory };
      }
      return selectedDevice;
    },
    [selectedDevice, selectedDeviceHistory, selectedDeviceId]
  );

  const isHighLoad = (device) => {
    const cpu = Number(device?.current?.cpuUsage || 0);
    const gpu = Number(device?.current?.gpuUsage || 0);
    const ram = Number(device?.current?.memoryUsage || 0);
    return cpu >= 85 || gpu >= 85 || ram >= 85;
  };

  const aggregatedHistory = useMemo(() => {
    const rawDetailed = fullSelectedDevice?.recentDetailed || []; // Use fullSelectedDevice for history
    if (!rawDetailed.length) return [];
    
    // De más antiguo a más nuevo y normalizamos el campo de fecha para asegurar consistencia
    let raw = [...rawDetailed].reverse().map(item => ({
      ...item,
      timestamp: item.timestamp || item.capturedAt || item.createdAt || item.lastInfoTime
    }));
    
    // Si es tiempo real, aplicamos el límite directamente
    if (timeScale === "raw") {
      // Solo permitimos ver "Tiempo Real" si el equipo está conectado
      if (!fullSelectedDevice?.online) return [];
      
      if (historyDisplayLimit > 0) raw = raw.slice(-historyDisplayLimit);
      return raw;
    }

    const groups = {};
    raw.forEach((entry) => {
      const ts = entry.timestamp;
      const d = new Date(ts);
      if (isNaN(d.getTime())) return;

      let key;
      // Diario -> Referencia por hora
      if (timeScale === "daily") key = d.toISOString().slice(0, 13) + ":00";
      // Semanal -> Referencia por día
      else if (timeScale === "weekly") key = d.toISOString().slice(0, 10);
      // Mensual -> Referencia por semana
      else if (timeScale === "monthly") {
        const oneJan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil((((d - oneJan) / 86400000) + oneJan.getDay() + 1) / 7);
        key = `${d.getFullYear()}-W${week}`;
      }

      if (!groups[key]) {
        groups[key] = { cpu: [], gpu: [], ram: [], timestamp: ts, label: key };
      }
      groups[key].cpu.push(Number(entry.cpuUsage || 0));
      groups[key].gpu.push(Number(entry.gpuUsage || 0));
      groups[key].ram.push(Number(entry.memoryUsage || 0));
    });

    let result = Object.values(groups).map((g) => ({
      timestamp: g.timestamp,
      label: (() => {
        const d = new Date(g.timestamp);
        // Diario -> Muestra la hora (00:00h, 01:00h...)
        if (timeScale === "daily") {
          return d.getHours().toString().padStart(2, '0') + ":00h";
        }
        // Semanal -> Muestra el nombre del día (Lunes 18/05...)
        if (timeScale === "weekly") {
          return d.toLocaleDateString("es-ES", { weekday: 'long', day: '2-digit', month: '2-digit' });
        }
        // Mensual -> Muestra Semana X (Inicio al Fin)
        if (timeScale === "monthly") {
          const weekNum = g.label.split('-W')[1];
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          const start = new Date(new Date(d).setDate(diff));
          const end = new Date(new Date(start).setDate(start.getDate() + 6));
          const fmt = (dt) => `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}`;
          return `Semana ${weekNum} (${fmt(start)} al ${fmt(end)})`;
        }
        return g.label;
      })(),
      // Aseguramos que el promedio sea un número válido
      cpuUsage: g.cpu.reduce((a, b) => a + b, 0) / (g.cpu.length || 1),
      gpuUsage: g.gpu.reduce((a, b) => a + b, 0) / (g.gpu.length || 1),
      memoryUsage: g.ram.reduce((a, b) => a + b, 0) / (g.ram.length || 1),
    }));

    // Aplicamos el límite sobre los periodos ya agregados (puntos en la gráfica)
    if (historyDisplayLimit > 0) result = result.slice(-historyDisplayLimit);

    return result;
  }, [selectedDevice, timeScale, historyDisplayLimit]);

  // Dimensiones constantes para la gráfica
  const GRAPH_WIDTH = 1000; // Mayor resolución horizontal para pantallas anchas
  const GRAPH_HEIGHT = 560; // Mantenemos una proporción cercana a 16:9
  const GRAPH_PADDING = 80; // Margen generoso para que nada se corte

  const getX = (i, total) => GRAPH_PADDING + (i * (GRAPH_WIDTH - 2 * GRAPH_PADDING)) / (total > 1 ? total - 1 : 1);
  const getY = (v) => {
    const val = Math.max(0, Math.min(100, Number(v) || 0));
    return (GRAPH_HEIGHT - GRAPH_PADDING) - (val * (GRAPH_HEIGHT - 2 * GRAPH_PADDING)) / 100;
  };

  const handleMouseMove = (e) => {
    if (!aggregatedHistory.length) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * GRAPH_WIDTH;
    
    const chartWidth = GRAPH_WIDTH - 2 * GRAPH_PADDING;
    let idx = Math.round(((x - GRAPH_PADDING) * (aggregatedHistory.length - 1)) / chartWidth);
    if (idx < 0) idx = 0;
    if (idx >= aggregatedHistory.length) idx = aggregatedHistory.length - 1;
    setHoveredIdx(idx);
  };

  const renderLine = (points, color) => {
    if (!points || points.length < 2) return null;
    let d = `M ${getX(0, points.length)} ${getY(points[0])}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${getX(i, points.length)} ${getY(points[i])}`;
    }
    
    // Creamos un área sombreada bajo la línea para un look más profesional
    const lastX = getX(points.length - 1, points.length);
    const areaD = `${d} L ${lastX} ${GRAPH_HEIGHT - GRAPH_PADDING} L ${GRAPH_PADDING} ${GRAPH_HEIGHT - GRAPH_PADDING} Z`;

    return (
      <g key={color}>
        <path d={areaD} fill={color} fillOpacity="0.08" style={{ transition: 'all 0.4s ease' }} />
        <path d={d} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'all 0.4s ease' }} />
      </g>
    );
  };

  if (!user || Number(user.level) !== 1) {
    return (
      <div className="page centered">
        <p>Acceso solo permitido al administrador.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="card">
        <div className="activity-header">
          <div>
            <h1>Monitor de dispositivos</h1>
            <p className="subtitle">
              Pulsa un dispositivo para ver su panel completo de CPU, GPU, RAM y procesos.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={refreshNow}
            disabled={refreshing || socketState !== "connected"}
          >
            {refreshing ? "Solicitando..." : "Refrescar por socket"}
          </button>
        </div>

        <div className="activity-meta">
          <span>
            Socket: <strong>{socketState}</strong>
          </span>
          <span>
            Dispositivos online: <strong>{totalOnline}</strong> / {data.length}
          </span>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {loading ? (
          <p className="subtitle">Cargando actividad...</p>
        ) : data.length === 0 ? (
          <p className="subtitle">No hay datos de actividad todavía.</p>
        ) : (
          <div className="activity-device-list-full">
            {data.map((device) => (
              <button
                key={device.deviceId}
                type="button"
                className={`activity-device-panel-row${isHighLoad(device) ? " high-load" : ""}`}
                onClick={() => {
                  setSelectedDeviceId(device.deviceId);
                  setModalTab("current");
                }}
                style={{ 
                  width: '100%', 
                  marginBottom: '0.5rem', 
                  background: 'transparent', 
                  padding: '0.4rem 1rem',
                  minHeight: 'auto',
                  border: '1px solid var(--border-color, rgba(0,0,0,0.1))',
                  boxShadow: 'none'
                }}
              >
                <div className="device-panel-flex" style={{ margin: 0, padding: 0 }}>
                  <div className="device-panel-info" style={{ gap: '0.75rem' }}>
                    <h3 className="device-panel-name" style={{ margin: 0, fontSize: '0.95rem' }}>{device.deviceId}</h3>
                    <span className={`status-badge ${device.online ? 'online' : 'offline'}`} style={{ 
                      fontSize: '0.65rem', 
                      padding: '2px 6px', 
                      borderRadius: '4px',
                      color: device.online ? '#28a745' : '#666',
                      fontWeight: 'bold'
                    }}>
                      {device.online ? "● ONLINE" : `○ OFFLINE (Visto: ${formatDate(device.lastInfoTime)})`}
                    </span>
                  </div>
                  <div className="device-panel-summary" style={{ gap: '1.2rem' }}>
                    <div className="summary-pill" style={{ fontSize: '0.85rem' }}>CPU: <strong>{formatPercent(device.current?.cpuUsage)}</strong></div>
                    <div className="summary-pill" style={{ fontSize: '0.85rem' }}>GPU: <strong>{formatPercent(device.current?.gpuUsage)}</strong></div>
                    <div className="summary-pill" style={{ fontSize: '0.85rem' }}>RAM: <strong>{formatPercent(device.current?.memoryUsage)}</strong></div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
      {selectedDevice ? (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedDeviceId("")}
          role="presentation"
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{ 
              maxWidth: '95%', 
              width: '90vw', 
              maxHeight: '90vh', 
              display: 'flex', 
              flexDirection: 'column', 
              overflow: 'hidden'
            }}
          >
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>
                {fullSelectedDevice.online ? "Panel actual de" : "Últimos datos de"} {fullSelectedDevice.deviceId}
              </h2>
              <button
                type="button"
                className="btn-primary"
                onClick={() => refreshNow(selectedDevice.deviceId)}
                disabled={refreshing || socketState !== "connected"}
                style={{ marginLeft: 'auto', marginRight: '1rem', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
              >
                {refreshing ? "Actualizando..." : "Refrescar equipo"}
              </button>
              <button
                type="button"
                className="btn-outline modal-close-btn"
                onClick={() => setSelectedDeviceId("")}
              >
                Cerrar
              </button>
            </div>

            <div className="modal-tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color, rgba(0,0,0,0.1))', marginBottom: '1rem' }}>
              <button 
                className={`tab-btn ${modalTab === 'current' ? 'active' : ''}`}
                onClick={() => setModalTab('current')}
                style={{ 
                  padding: '0.6rem 1rem', border: 'none', background: 'none', 
                  borderBottom: modalTab === 'current' ? '2px solid #1a5fb4' : 'none', 
                  cursor: 'pointer', fontWeight: modalTab === 'current' ? 'bold' : 'normal',
                  color: modalTab === 'current' ? '#1a5fb4' : 'inherit'
                }}
              >
                Estado Actual
              </button>
              <button 
                className={`tab-btn ${modalTab === 'history' ? 'active' : ''}`}
                onClick={() => setModalTab('history')}
                style={{ 
                  padding: '0.6rem 1rem', border: 'none', background: 'none', 
                  borderBottom: modalTab === 'history' ? '2px solid #1a5fb4' : 'none', 
                  cursor: 'pointer', fontWeight: modalTab === 'history' ? 'bold' : 'normal',
                  color: modalTab === 'history' ? '#1a5fb4' : 'inherit'
                }}
              >
                Historial ({fullSelectedDevice.recentDetailed?.length || 0})
              </button>
            </div>

            {modalTab === "history" ? (
              <div className="history-view">
                <div className="history-controls" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center', background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Escala:</span>
                    <div className="btn-group" style={{ display: 'flex', gap: '2px' }}>
                      {[
                        { id: 'raw', label: 'Tiempo Real' },
                        { id: 'daily', label: 'Diaria' },
                        { id: 'weekly', label: 'Semanal' },
                        { id: 'monthly', label: 'Mensual' }
                      ].map(scale => (
                        <button 
                          key={scale.id}
                          onClick={() => setTimeScale(scale.id)}
                          className={timeScale === scale.id ? "btn-primary" : "btn-outline"}
                          style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem', minWidth: 'auto' }}
                        >
                          {scale.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Desde:</span>
                    <input
                        type="date"
                        value={startDate ? new Date(startDate).toISOString().slice(0, 10) : ''}
                        onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : null)}
                        className="admin-native-select"
                        style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Hasta:</span>
                    <input
                        type="date"
                        value={endDate ? new Date(endDate).toISOString().slice(0, 10) : ''}
                        onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value) : null)}
                        className="admin-native-select"
                        style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Muestras:</span>
                    <select value={historyDisplayLimit} onChange={(e) => setHistoryDisplayLimit(Number(e.target.value))} className="admin-native-select" style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}>
                      <option value={10}>Últimas 10</option>
                      <option value={50}>Últimas 50</option>
                      <option value={100}>Últimas 100</option>
                      <option value={0}>Todas</option>
                    </select>
                  </div>
                </div>

                {timeScale === "raw" && !fullSelectedDevice?.online ? (
                  <div className="alert alert-error" style={{ textAlign: 'center', padding: '3rem' }}>
                    <p><strong>Tiempo Real no disponible</strong></p>
                    <p className="text-small">El dispositivo está desconectado. El modo de telemetría en vivo solo está disponible cuando el equipo está ONLINE.</p>
                  </div>
                ) : aggregatedHistory.length < 2 ? (
                  <div className="alert" style={{ textAlign: 'center', padding: '3rem' }}>
                    <p className="muted">No hay suficientes datos históricos para mostrar una gráfica en esta escala.</p>
                  </div>
                ) : (
                  <>
                      <div className="graph-container" style={{ 
                        background: '#fff', 
                        border: '1px solid #eee', 
                        borderRadius: '8px', 
                        padding: '1.5rem', 
                        position: 'relative', 
                        marginBottom: '1.5rem', 
                        // width: '60vw', // 60% del ancho de la resolución
                        width: '85vw', // Escalado proporcional al modal (90vw)
                        height: '50vh', // 50% del alto para no tapar los botones
                        margin: '0 auto',
                        minHeight: '400px',
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
                        <span style={{ color: '#1a5fb4', fontWeight: 'bold' }}>● CPU</span>
                        <span style={{ color: '#e67e22', fontWeight: 'bold' }}>● GPU</span>
                        <span style={{ color: '#27ae60', fontWeight: 'bold' }}>● RAM</span>
                      </div>
                      <svg
                        viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`} 
                          style={{ width: '100%', flex: 1, display: 'block', cursor: 'crosshair', background: '#fafafa', borderRadius: '4px' }}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={() => setHoveredIdx(null)}
                      >
                        {/* Grid Y */}
                        {[0, 25, 50, 75, 100].map(v => {
                          const yPos = getY(v);
                          return (
                          <g key={v}>
                              <line x1={GRAPH_PADDING} y1={yPos} x2={GRAPH_WIDTH - GRAPH_PADDING} y2={yPos} stroke="#f0f0f0" strokeWidth="1" />
                              <text x={GRAPH_PADDING - 15} y={yPos + 6} textAnchor="end" fontSize="14" fill="#666" fontWeight="bold">{v}%</text>
                              <text x={GRAPH_PADDING - 15} y={yPos + 6} textAnchor="end" fontSize="15" fill="#555" fontWeight="bold">{v}%</text>
                          </g>
                          );
                        })}
                        
                        {renderLine(aggregatedHistory.map(h => h.cpuUsage), '#1a5fb4')}
                        {renderLine(aggregatedHistory.map(h => h.gpuUsage), '#e67e22')}
                        {renderLine(aggregatedHistory.map(h => h.memoryUsage), '#27ae60')}

                        {/* Marcador de Hover */}
                        {hoveredIdx !== null && aggregatedHistory[hoveredIdx] && (
                          <g>
                            <line 
                              x1={getX(hoveredIdx, aggregatedHistory.length)} 
                              y1={GRAPH_PADDING} 
                              x2={getX(hoveredIdx, aggregatedHistory.length)} 
                              y2={GRAPH_HEIGHT - GRAPH_PADDING} 
                              stroke="#ccc" strokeDasharray="4" 
                            />
                            <circle cx={getX(hoveredIdx, aggregatedHistory.length)} cy={getY(aggregatedHistory[hoveredIdx].cpuUsage || 0)} r="5" fill="#1a5fb4" stroke="#fff" strokeWidth="2" />
                            <circle cx={getX(hoveredIdx, aggregatedHistory.length)} cy={getY(aggregatedHistory[hoveredIdx].gpuUsage || 0)} r="5" fill="#e67e22" stroke="#fff" strokeWidth="2" />
                            <circle cx={getX(hoveredIdx, aggregatedHistory.length)} cy={getY(aggregatedHistory[hoveredIdx].memoryUsage || 0)} r="5" fill="#27ae60" stroke="#fff" strokeWidth="2" />
                          </g>
                        )}

                        {/* Referencias del eje X (Evolución temporal según escala) */}
                        {aggregatedHistory.map((h, i) => {
                          let show = false;
                          // En tiempo real: mostramos inicio, medio y fin para evitar solapamientos
                          if (timeScale === 'raw') {
                            show = i === 0 || i === Math.floor(aggregatedHistory.length / 2) || i === aggregatedHistory.length - 1;
                          } else {
                            // En escalas agregadas (Diaria, Semanal, Mensual): mostramos etiquetas con un paso lógico para legibilidad
                            const step = aggregatedHistory.length > 15 ? Math.ceil(aggregatedHistory.length / 8) : 1;
                            show = i % step === 0 || i === aggregatedHistory.length - 1;
                          }

                          if (!show) return null;

                          return (
                            <text 
                              key={i}
                              x={getX(i, aggregatedHistory.length)} 
                              y={GRAPH_HEIGHT - 10} 
                              textAnchor={i === 0 ? "start" : i === aggregatedHistory.length - 1 ? "end" : "middle"}
                              fontSize="15" 
                              fill="#555"
                              fontWeight="bold"
                            >
                              {timeScale === 'raw' ? new Date(h.timestamp).toLocaleTimeString("es-ES", { hour: '2-digit', minute: '2-digit' }) : h.label}
                            </text>
                          );
                        })}
                      </svg>

                      {/* Tooltip flotante */}
                      {hoveredIdx !== null && aggregatedHistory[hoveredIdx] && (
                        <div style={{
                          position: 'absolute',
                          top: '60px',
                          left: getX(hoveredIdx, aggregatedHistory.length) > 400 ? '60px' : 'auto',
                          right: getX(hoveredIdx, aggregatedHistory.length) > 400 ? 'auto' : '60px',
                          background: 'rgba(255,255,255,1)',
                          border: '1px solid #ccc',
                          padding: '0.8rem',
                          borderRadius: '6px',
                          boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                          fontSize: '0.85rem',
                          pointerEvents: 'none',
                          zIndex: 10,
                          minWidth: '180px'
                        }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '6px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                            {timeScale === 'raw' ? formatDate(aggregatedHistory[hoveredIdx].timestamp) : aggregatedHistory[hoveredIdx].label}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1a5fb4', marginBottom: '2px' }}>
                            <span>CPU:</span> <strong>{formatPercent(aggregatedHistory[hoveredIdx].cpuUsage || 0)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#e67e22', marginBottom: '2px' }}>
                            <span>GPU:</span> <strong>{formatPercent(aggregatedHistory[hoveredIdx].gpuUsage || 0)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#27ae60' }}>
                            <span>RAM:</span> <strong>{formatPercent(aggregatedHistory[hoveredIdx].memoryUsage || 0)}</strong>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="history-table" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                      <table className="users-table" style={{ fontSize: '0.85rem' }}>
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>CPU</th>
                            <th>GPU</th>
                            <th>RAM</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...aggregatedHistory].reverse().map((h, i) => (
                            <tr key={i}>
                              <td>{timeScale === 'raw' ? formatDate(h.timestamp) : h.label}</td>
                              <td style={{ color: '#1a5fb4', fontWeight: 'bold' }}>{formatPercent(h.cpuUsage)}</td>
                              <td style={{ color: '#e67e22', fontWeight: 'bold' }}>{formatPercent(h.gpuUsage)}</td>
                              <td style={{ color: '#27ae60', fontWeight: 'bold' }}>{formatPercent(h.memoryUsage)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            ) : (
              (() => { // This block is for the "Estado Actual" tab
                const latest = (fullSelectedDevice.recentDetailed || [])[0] || null;
                const cpuProcesses = Array.isArray(latest?.processList)
                  ? latest.processList.slice(0, 5)
                  : [];
                const gpuProcesses = Array.isArray(latest?.gpuProcessList)
                  ? latest.gpuProcessList.slice(0, 5)
                  : [];
                
                // Identificar proceso con consumo crítico (70% - 100%)
                const criticalProcess = [...cpuProcesses, ...gpuProcesses]
                  .filter(p => (p.cpu || 0) >= 70 || (p.gpu || 0) >= 70)
                  .sort((a, b) => (b.cpu || b.gpu) - (a.cpu || a.gpu))[0];

                if (!latest && !fullSelectedDevice.current) {
                  return (
                    <div className="alert alert-error" style={{ margin: '2rem 0', textAlign: 'center' }}>
                      <p><strong>No hay telemetría disponible</strong></p>
                      <p className="text-small">Este dispositivo aún no ha enviado datos de rendimiento al servidor. Asegúrate de que el agente esté ejecutándose en el equipo remoto.</p>
                      <button 
                        type="button" 
                        className="btn-primary" 
                        style={{ marginTop: '1rem' }}
                        onClick={() => refreshNow(selectedDevice.deviceId)}
                        disabled={refreshing || socketState !== "connected"}
                      >
                        {refreshing ? "Solicitando..." : "Intentar forzar actualización"}
                      </button>
                    </div>
                  );
                }

                return (
                  <>
                    {criticalProcess && (
                      <div className="alert alert-error" style={{ marginBottom: '1.5rem', borderLeft: '5px solid #d32f2f', background: '#fff1f0' }}>
                        <p style={{ margin: 0, fontWeight: 'bold', color: '#d32f2f' }}>
                          ⚠️ ALERTA DE CONSUMO CRÍTICO
                        </p>
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.9rem' }}>
                          El proceso <strong>{criticalProcess.name}</strong> está consumiendo un <strong>{formatPercent(criticalProcess.cpu || criticalProcess.gpu)}</strong> de recursos.
                        </p>
                      </div>
                    )}

                    <p className="text-small" style={{ color: fullSelectedDevice.online ? 'inherit' : '#d32f2f', fontWeight: fullSelectedDevice.online ? 'normal' : 'bold' }}>
                      {fullSelectedDevice.online ? "Último dato:" : "EQUIPO DESCONECTADO - Mostrando última telemetría de:"} {formatDate(fullSelectedDevice.lastInfoTime)}
                    </p>

                    {fullSelectedDevice.lastRefreshRequestAt && (
                      <p className="text-small" style={{ marginTop: '-0.8rem', marginBottom: '1.2rem', opacity: 0.7, fontStyle: 'italic' }}>
                        Última solicitud de actualización: {formatDate(selectedDevice.lastRefreshRequestAt)}
                      </p>
                    )}

                    <div className="monitor-resource-bars-detailed">
                      <div className="monitor-resource-bar-item">
                        <div className="resource-bar-info">
                          <span>CPU</span>
                          <strong>{formatPercent(fullSelectedDevice.current?.cpuUsage)}</strong>
                        </div>
                        <div className="resource-bar-container">
                          <div className="resource-bar-fill" style={{ width: `${Math.max(0, Math.min(100, Number(fullSelectedDevice.current?.cpuUsage || 0)))}%`, backgroundColor: '#1a5fb4' }} />
                        </div>
                      </div>
                      <div className="monitor-resource-bar-item">
                        <div className="resource-bar-info">
                          <span>GPU</span>
                          <strong>{formatPercent(fullSelectedDevice.current?.gpuUsage)}</strong>
                        </div>
                        <div className="resource-bar-container">
                          <div className="resource-bar-fill" style={{ width: `${Math.max(0, Math.min(100, Number(fullSelectedDevice.current?.gpuUsage || 0)))}%`, backgroundColor: '#1a5fb4' }} />
                        </div>
                      </div>
                      <div className="monitor-resource-bar-item">
                        <div className="resource-bar-info">
                          <span>RAM</span>
                          <strong>{formatPercent(fullSelectedDevice.current?.memoryUsage)}</strong>
                        </div>
                        <div className="resource-bar-container">
                          <div className="resource-bar-fill" style={{ width: `${Math.max(0, Math.min(100, Number(fullSelectedDevice.current?.memoryUsage || 0)))}%`, backgroundColor: '#1a5fb4' }} />
                        </div>
                      </div>
                    </div>

                    <div className="monitor-process-grid">
                      <div className="monitor-process-card">
                        <h3>Procesos CPU</h3>
                        {cpuProcesses.length === 0 ? (
                          <div className="activity-row muted">Sin datos de procesos CPU</div>
                        ) : (
                          cpuProcesses.map((p, idx) => (
                            <div key={`${fullSelectedDevice.deviceId}-cpu-${p.pid || p.name}-${idx}`} className="activity-row">
                              <strong>{p.name}</strong> · PID {p.pid ?? "—"} · CPU{" "}
                              {formatPercent(p.cpu)}
                            </div>
                          ))
                        )}
                      </div>
                      <div className="monitor-process-card">
                        <h3>Procesos GPU</h3>
                        {gpuProcesses.length === 0 ? (
                          <div className="activity-row muted">Sin datos de procesos GPU</div>
                        ) : (
                          gpuProcesses.map((p, idx) => (
                            <div key={`${fullSelectedDevice.deviceId}-gpu-${p.pid || p.name}-${idx}`} className="activity-row">
                              <strong>{p.name}</strong> · PID {p.pid ?? "—"} · GPU{" "}
                              {formatPercent(p.gpu)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
