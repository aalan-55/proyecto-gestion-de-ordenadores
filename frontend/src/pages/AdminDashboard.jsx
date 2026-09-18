import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";
import { apiRequest } from "../utils/apiClient.js";

export default function AdminDashboard() {
  const { token, user, changePassword } = useAuth();
  const location = useLocation();

  const [deviceName, setDeviceName] = useState("");
  const [sshPort, setSshPort] = useState(40);
  const [sshRootUsername, setSshRootUsername] = useState("root");
  const [sshRootPassword, setSshRootPassword] = useState("");
  const [assignUser, setAssignUser] = useState("");
  const [assignUserSearch, setAssignUserSearch] = useState("");
  const [userComboOpen, setUserComboOpen] = useState(false);
  const [assignDevice, setAssignDevice] = useState("");
  const [reservationStart, setReservationStart] = useState("");
  const [reservationEnd, setReservationEnd] = useState("");
  const [removeDevice, setRemoveDevice] = useState("");

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [deviceSearch, setDeviceSearch] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [activeCombo, setActiveCombo] = useState(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingAction, setLoadingAction] = useState(false);
  const [view, setView] = useState("inicio"); // "inicio" | "perfil"
  const [pw, setPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMessage, setPwMessage] = useState("");

  const [resetUser, setResetUser] = useState("");
  const [resetUserSearch, setResetUserSearch] = useState("");
  const [resetComboOpen, setResetComboOpen] = useState(false);
  const [resetPw, setResetPw] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  const [clearUser, setClearUser] = useState("");
  const [clearUserSearch, setClearUserSearch] = useState("");
  const [clearComboOpen, setClearComboOpen] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [clearMessage, setClearMessage] = useState("");

  const [overCapacityWarning, setOverCapacityWarning] = useState(null);
  const [pendingAssign, setPendingAssign] = useState(null);

  const [deleteUserName, setDeleteUserName] = useState("");
  const [deleteUserSearch, setDeleteUserSearch] = useState("");
  const [deleteComboOpen, setDeleteComboOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [reserveRequests, setReserveRequests] = useState([]);
  const [reserveReqLoading, setReserveReqLoading] = useState(false);
  const [reserveReqError, setReserveReqError] = useState("");
  const [handleNote, setHandleNote] = useState("");
  const [handleDevice, setHandleDevice] = useState("");

  // Gestión de dispositivos asignados a alumnos
  const [deviceAlumnoSearch, setDeviceAlumnoSearch] = useState("");
  const [deviceAlumnoFilterDevice, setDeviceAlumnoFilterDevice] = useState("");
  const [deviceAlumnoPage, setDeviceAlumnoPage] = useState(1);
  const deviceAlumnoPageSize = 5;
  const [deviceAlumnoActionLoading, setDeviceAlumnoActionLoading] = useState(false);
  const [deviceAlumnoActionMessage, setDeviceAlumnoActionMessage] = useState("");
  const [deviceAlumnoActionError, setDeviceAlumnoActionError] = useState("");
  const [reassignDeviceByUserKey, setReassignDeviceByUserKey] = useState({});

  useEffect(() => {
    if (location?.state?.view === "perfil") {
      setView("perfil");
    } else {
      setView("inicio");
    }
  }, [location?.state?.view]);

  const computedSshHost = useMemo(() => {
    const normalized = String(deviceName || "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase();
    return normalized ? `${normalized}.uv.es` : "";
  }, [deviceName]);

  const loadDevices = async () => {
    if (!token) return;
    setLoadingDevices(true);
    try {
      const data = await apiRequest("/pc-count", { token });
      const list = Array.isArray(data) ? data : data.devices || [];
      setDevices(list);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los equipos disponibles.");
    } finally {
      setLoadingDevices(false);
    }
  };

  const loadUsers = async () => {
    if (!token) return;
    setLoadingUsers(true);
    try {
      const data = await apiRequest("/users", { token });
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los usuarios.");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadDevices();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const devicesForSelect = useMemo(() => {
    const normalize = (v) =>
      String(v || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

    return (devices || [])
      .map((d) => {
        const deviceId = d.deviceId;
        const assignedCount = (users || []).filter((u) => {
          const ud = u.device ? String(u.device) : "";
          return normalize(ud) === normalize(deviceId);
        }).length;

        return { id: deviceId, assignedCount };
      })
      .filter((d) => d.id);
  }, [devices, users]);

  const deviceAlumnoFiltered = useMemo(() => {
    const term = (deviceAlumnoSearch || "").toLowerCase().trim();
    const deviceTerm = (deviceAlumnoFilterDevice || "").toLowerCase().trim();

    return (users || []).filter((u) => {
      const name = String(u.username || "").toLowerCase();
      const email = String(u.email || "").toLowerCase();
      const matchesName = !term || name.includes(term) || email.includes(term);

      let matchesDevice = true;
      if (deviceTerm) {
        // convención: "__NONE__" = sin equipo
        if (deviceTerm === "__NONE__") {
          matchesDevice = !u.device;
        } else {
          matchesDevice =
            String(u.device || "").toLowerCase() === deviceTerm;
        }
      }

      return matchesName && matchesDevice;
    });
  }, [users, deviceAlumnoSearch, deviceAlumnoFilterDevice]);

  const deviceAlumnoTotalPages = useMemo(() => {
    const total = Math.ceil(deviceAlumnoFiltered.length / deviceAlumnoPageSize);
    return total > 0 ? total : 1;
  }, [deviceAlumnoFiltered, deviceAlumnoPageSize]);

  const deviceAlumnoSafePage = useMemo(() => {
    return Math.min(Math.max(deviceAlumnoPage, 1), deviceAlumnoTotalPages);
  }, [deviceAlumnoPage, deviceAlumnoTotalPages]);

  const deviceAlumnoPaged = useMemo(() => {
    const startIndex = (deviceAlumnoSafePage - 1) * deviceAlumnoPageSize;
    const endIndex = startIndex + deviceAlumnoPageSize;
    return deviceAlumnoFiltered.slice(startIndex, endIndex);
  }, [deviceAlumnoFiltered, deviceAlumnoSafePage, deviceAlumnoPageSize]);

  useEffect(() => {
    setDeviceAlumnoPage(1);
  }, [deviceAlumnoSearch, deviceAlumnoFilterDevice]);

  const loadReserveRequests = async () => {
    if (!token) return;
    setReserveReqLoading(true);
    setReserveReqError("");
    try {
      const data = await apiRequest("/reserve/requests", { token });
      setReserveRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      setReserveReqError(err.message || "No se pudieron cargar las solicitudes.");
    } finally {
      setReserveReqLoading(false);
    }
  };

  const handleReserveDecision = async (userName, action, userDevice) => {
    if (!token || !userName) return;
    setReserveReqError("");
    try {
      const handleDeviceTrim = (handleDevice || "").trim();
      if (action === "ACCEPT" && !userDevice && !handleDeviceTrim) {
        setReserveReqError(
          "Debes indicar un equipo porque el usuario no tiene equipo asignado."
        );
        return;
      }
      await apiRequest(`/reserve/handle/${encodeURIComponent(userName)}`, {
        method: "POST",
        token,
        body: {
          action,
          adminNote: handleNote || "",
          deviceId: handleDeviceTrim || ""
        }
      });
      setHandleNote("");
      setHandleDevice("");
      await loadReserveRequests();
      await loadUsers();
      await loadDevices();
    } catch (err) {
      setReserveReqError(err.message || "No se pudo procesar la solicitud.");
    }
  };

  const makeHandleLink = (userName) => {
    const base = window.location.origin;
    return `${base}/panel-admin/solicitud/${encodeURIComponent(userName)}`;
  };

  const filteredDevices = useMemo(() => {
    if (!deviceSearch.trim()) return devices;
    const term = deviceSearch.toLowerCase();
    return devices.filter((d) =>
      (d.deviceId || "").toLowerCase().includes(term)
    );
  }, [devices, deviceSearch]);

  const filteredUsers = useMemo(() => {
    if (!assignUserSearch.trim()) return users;
    const term = assignUserSearch.toLowerCase();
    return users.filter((u) => {
      const name = (u.username || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [users, assignUserSearch]);

  const filteredUsersForReset = useMemo(() => {
    if (!resetUserSearch.trim()) return users;
    const term = resetUserSearch.toLowerCase();
    return users.filter((u) => {
      const name = (u.username || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [users, resetUserSearch]);

  const filteredUsersForClear = useMemo(() => {
    if (!clearUserSearch.trim()) return users;
    const term = clearUserSearch.toLowerCase();
    return users.filter((u) => {
      const name = (u.username || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [users, clearUserSearch]);

  const filteredUsersForDelete = useMemo(() => {
    if (!deleteUserSearch.trim()) return users;
    const term = deleteUserSearch.toLowerCase();
    return users.filter((u) => {
      const name = (u.username || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [users, deleteUserSearch]);

  if (!user) {
    return (
      <div className="page centered">
        <p>Cargando...</p>
      </div>
    );
  }

  const runAction = async (fn) => {
    setMessage("");
    setError("");
    setLoadingAction(true);
    try {
      await fn();
    } catch (err) {
      setError(err.message || "Se produjo un error.");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleAddPc = (e) => {
    e.preventDefault();
    if (!deviceName) return;
    runAction(async () => {
      await apiRequest("/add-pc", {
        method: "POST",
        token,
        body: {
          deviceName,
          sshHost: computedSshHost,
          sshPort: 40,
          sshRootUsername,
          sshRootPassword
        }
      });
      setMessage(`Equipo "${deviceName}" creado correctamente.`);
      setDeviceName("");
      setSshPort(40);
      setSshRootUsername("root");
      setSshRootPassword("");
      await loadDevices();
    });
  };

  const handleAssignPc = (e) => {
    e.preventDefault();
    if (!assignUser) return;
    const chosenDevice =
      assignDevice || (filteredDevices[0] && filteredDevices[0].deviceId);
    if (!chosenDevice) return;
    const currentUsersOnDevice = users.filter(
      (u) => u.device && u.device.toLowerCase() === chosenDevice.toLowerCase()
    ).length;

    if (currentUsersOnDevice >= 5 && !pendingAssign) {
      setPendingAssign({
        userName: assignUser,
        deviceName: chosenDevice,
        reservationStart,
        reservationEnd
      });
      setOverCapacityWarning(
        `El dispositivo "${chosenDevice}" ya tiene ${currentUsersOnDevice} usuarios asignados. ¿Quieres continuar igualmente?`
      );
      return;
    }

    const payload = pendingAssign || {
      userName: assignUser,
      deviceName: chosenDevice,
      reservationStart,
      reservationEnd
    };

    runAction(async () => {
      await apiRequest("/asign-pc", {
        method: "POST",
        token,
        body: {
          userName: payload.userName,
          deviceName: payload.deviceName,
          reservationStart: payload.reservationStart || null,
          reservationEnd: payload.reservationEnd || null
        }
      });
      setMessage(
        `Equipo "${payload.deviceName}" asignado a usuario "${payload.userName}" correctamente.`
      );
      setAssignUser("");
      setAssignUserSearch("");
      setAssignDevice("");
      setDeviceSearch("");
      setReservationStart("");
      setReservationEnd("");
      setPendingAssign(null);
      setOverCapacityWarning(null);
      await loadUsers();
    });
  };

  const handleRemovePc = (e) => {
    e.preventDefault();
    const chosenDevice =
      removeDevice || (filteredDevices[0] && filteredDevices[0].deviceId);
    if (!chosenDevice) return;
    runAction(async () => {
      await apiRequest("/remove-pc", {
        method: "DELETE",
        token,
        body: { deviceName: chosenDevice }
      });
      setMessage(`Equipo "${chosenDevice}" eliminado correctamente.`);
      setRemoveDevice("");
      setDeviceSearch("");
      await loadDevices();
    });
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

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetUser || !resetPw) return;
    setResetMessage("");
    setError("");
    setResetLoading(true);
    try {
      await apiRequest("/reset-password", {
        method: "PATCH",
        token,
        body: { userName: resetUser, newPassword: resetPw }
      });
      setResetMessage(`Contraseña restablecida para "${resetUser}".`);
      setResetPw("");
    } catch (err) {
      setError(err.message || "No se pudo restablecer la contraseña.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleClearReservation = async () => {
    if (!clearUser) return;
    setClearMessage("");
    setError("");
    setClearLoading(true);
    try {
      await apiRequest("/clear-reservation", {
        method: "PATCH",
        token,
        body: { userName: clearUser }
      });
      setClearMessage(`Reserva eliminada para "${clearUser}".`);
    } catch (err) {
      setError(err.message || "No se pudo eliminar la reserva.");
    } finally {
      setClearLoading(false);
    }
  };

  const handleReassignUserDevice = async (userKey, deviceIdToSet) => {
    if (!userKey || !deviceIdToSet) return;
    setDeviceAlumnoActionMessage("");
    setDeviceAlumnoActionError("");
    setDeviceAlumnoActionLoading(true);
    try {
      await apiRequest("/reassign-user-device", {
        method: "PATCH",
        token,
        body: { userName: userKey, deviceId: deviceIdToSet }
      });
      setDeviceAlumnoActionMessage(
        `Dispositivo actualizado para "${userKey}".`
      );
      await loadUsers();
      await loadDevices();
    } catch (err) {
      setDeviceAlumnoActionError(err.message || "No se pudo reasignar.");
    } finally {
      setDeviceAlumnoActionLoading(false);
    }
  };

  const handleUnassignUserDevice = async (userKey) => {
    if (!userKey) return;
    setDeviceAlumnoActionMessage("");
    setDeviceAlumnoActionError("");
    setDeviceAlumnoActionLoading(true);
    try {
      await apiRequest("/unassign-user-device", {
        method: "PATCH",
        token,
        body: { userName: userKey }
      });
      setDeviceAlumnoActionMessage(
        `Dispositivo eliminado para "${userKey}".`
      );
      await loadUsers();
      await loadDevices();
    } catch (err) {
      setDeviceAlumnoActionError(err.message || "No se pudo eliminar.");
    } finally {
      setDeviceAlumnoActionLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserName) return;
    setDeleteMessage("");
    setError("");
    setDeleteLoading(true);
    try {
      await apiRequest("/users", {
        method: "DELETE",
        token,
        body: { userName: deleteUserName }
      });
      setDeleteMessage(`Usuario "${deleteUserName}" eliminado correctamente.`);
      setDeleteUserName("");
      setDeleteUserSearch("");
      await loadUsers();
    } catch (err) {
      setError(err.message || "No se pudo eliminar el usuario.");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="page">
      <section className="card">
        <h1>
          {view === "perfil"
            ? `Perfil de ${user.username}`
            : "Panel de control"}
        </h1>
        <p className="subtitle">
          {view === "perfil"
            ? "Datos personales del administrador y cambio de contraseña."
            : "Gestiona los equipos y su asignación a los estudiantes."}
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}
        {view === "perfil" ? (
          <div className="grid-2">
            <div className="info-block">
              <h2>Datos personales</h2>
              <ul className="info-list">
                <li>
                  <strong>Usuario:</strong> {user.username}
                </li>
                <li>
                  <strong>Correo:</strong> {user.email || "No definido"}
                </li>
                <li>
                  <strong>Rol:</strong> Administrador
                </li>
              </ul>
            </div>
            <div className="info-block">
              <h2>Información</h2>
              <p>
                Desde este perfil puedes revisar tus datos y actualizar tu
                contraseña de acceso a la plataforma.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Bloque 1: manejo de equipos (crear / eliminar) */}
            <section className="card panel-block">
              <h2>Gestión de equipos</h2>
              <div className="grid-2">
                <form onSubmit={handleAddPc} className="form admin-block">
                  <h3>Crear nuevo equipo</h3>
                  <label className="form-field">
                    <span>Nombre del equipo</span>
                    <input
                      type="text"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      placeholder="PC-LAB-01"
                      required
                    />
                  </label>

                  <div className="divider" />

                  <h4 style={{ margin: "0.8rem 0 0.4rem" }}>Detalles SSH</h4>
                  <label className="form-field full">
                    <span>Host/IP del equipo</span>
                    <input
                      type="text"
                      value={computedSshHost}
                      readOnly
                      placeholder="nombredispositivo.uv.es"
                      required
                    />
                  </label>
                  <label className="form-field full">
                    <span>Puerto SSH</span>
                    <input
                      type="number"
                      value={sshPort}
                      readOnly
                      min={40}
                      max={40}
                      required
                    />
                  </label>
                  <label className="form-field full">
                    <span>Usuario root</span>
                    <input
                      type="text"
                      value={sshRootUsername}
                      onChange={(e) => setSshRootUsername(e.target.value)}
                      placeholder="root"
                      required
                    />
                  </label>
                  <label className="form-field full">
                    <span>Contraseña root</span>
                    <input
                      type="password"
                      value={sshRootPassword}
                      onChange={(e) => setSshRootPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={loadingAction}
                  >
                    Crear equipo
                  </button>
                </form>

                <form onSubmit={handleRemovePc} className="form admin-block">
                  <h3>Eliminar equipo</h3>
                  <label className="form-field">
                    <span>Buscar y seleccionar equipo</span>
                    <div className="device-combo">
                      <input
                        type="text"
                        className="device-combo-input"
                        value={deviceSearch}
                        onFocus={() => {
                          setActiveCombo("remove");
                          setComboOpen(true);
                        }}
                        onBlur={() => {
                          setTimeout(() => setComboOpen(false), 100);
                        }}
                        onChange={(e) => {
                          setActiveCombo("remove");
                          setDeviceSearch(e.target.value);
                          setComboOpen(true);
                        }}
                        placeholder="Buscar equipo por nombre..."
                      />
                      {comboOpen && activeCombo === "remove" && (
                        <div className="device-combo-list">
                          {loadingDevices && (
                            <div className="device-combo-item muted">
                              Cargando equipos...
                            </div>
                          )}
                          {!loadingDevices && filteredDevices.length === 0 && (
                            <div className="device-combo-item muted">
                              No hay equipos que coincidan.
                            </div>
                          )}
                          {!loadingDevices &&
                            filteredDevices.map((d) => (
                              <button
                                type="button"
                                key={d._id || d.deviceId}
                                className="device-combo-item"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setRemoveDevice(d.deviceId);
                                  setDeviceSearch(d.deviceId);
                                  setComboOpen(false);
                                }}
                              >
                                {d.deviceId}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </label>
                  <button
                    type="submit"
                    className="btn-outline danger"
                    disabled={loadingAction}
                  >
                    Eliminar equipo
                  </button>
                </form>
              </div>
            </section>

          </>
        )}
      </section>

      {view === "inicio" && (
        <>
          {/* Bloque 2: gestión de dispositivos asignados */}
          <section className="card panel-block">
            <h2>Gestión de dispositivos asignados</h2>
            <p className="subtitle">
              Reasigna o elimina el dispositivo asignado a un alumno. Vista
              general con filtros y paginación.
            </p>
            {deviceAlumnoActionMessage && (
              <div className="alert alert-success">
                {deviceAlumnoActionMessage}
              </div>
            )}
            {deviceAlumnoActionError && (
              <div className="alert alert-error">
                {deviceAlumnoActionError}
              </div>
            )}

            <div className="form inline" style={{ marginBottom: "0.75rem" }}>
              <label className="form-field" style={{ flex: 1, minWidth: 0 }}>
                <span>Buscar alumno</span>
                <input
                  type="text"
                  value={deviceAlumnoSearch}
                  onChange={(e) => setDeviceAlumnoSearch(e.target.value)}
                  placeholder="Nombre o email..."
                />
              </label>
              <label className="form-field" style={{ minWidth: 220 }}>
                <span>Filtrar por dispositivo</span>
                <select
                  className="admin-native-select"
                  value={deviceAlumnoFilterDevice}
                  onChange={(e) => setDeviceAlumnoFilterDevice(e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="__NONE__">Sin equipo</option>
                  {devicesForSelect.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.id} ({d.assignedCount})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="info-block">
              <h2 style={{ marginBottom: "0.35rem", fontSize: "1rem" }}>
                Total alumnos: {users.length}
              </h2>
              <ul className="info-list">
                <li>
                  <strong>Con equipo:</strong> {users.filter((u) => !!u.device).length}
                </li>
                <li>
                  <strong>Sin equipo:</strong> {users.filter((u) => !u.device).length}
                </li>
              </ul>
              <p className="subtitle" style={{ marginTop: "0.4rem" }}>
                Mostrando {deviceAlumnoPaged.length} de{" "}
                {deviceAlumnoFiltered.length} alumnos (página{" "}
                {deviceAlumnoSafePage}).
              </p>
            </div>

            <div className="users-table-wrapper">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Alumno</th>
                    <th>Dispositivo actual</th>
                    <th>Dispositivo nuevo</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceAlumnoPaged.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No hay alumnos que coincidan.</td>
                    </tr>
                  ) : (
                    deviceAlumnoPaged.map((u) => {
                      const userKey = u.username || u.email;
                      const currentDevice = u.device || "";
                      const defaultDevice =
                        devicesForSelect[0]?.id || currentDevice || "";
                      const selected =
                        reassignDeviceByUserKey[userKey] ||
                        currentDevice ||
                        defaultDevice;
                      const currentDeviceExistsInList = devicesForSelect.some(
                        (d) => d.id === currentDevice
                      );
                      return (
                        <tr key={u.email || u.username}>
                          <td>{userKey}</td>
                    <td>{currentDevice || "Sin equipo"}</td>
                    <td style={{ minWidth: 260 }}>
                      <select
                              className="admin-native-select"
                              value={selected}
                              onChange={(e) =>
                                setReassignDeviceByUserKey((prev) => ({
                                  ...prev,
                                  [userKey]: e.target.value
                                }))
                              }
                              disabled={deviceAlumnoActionLoading}
                            >
                              {currentDevice &&
                              !currentDeviceExistsInList ? (
                                <option value={currentDevice}>
                                  {currentDevice}
                                </option>
                              ) : null}
                              {devicesForSelect.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.id}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <button
                              type="button"
                              className="btn-primary"
                              disabled={
                                deviceAlumnoActionLoading ||
                                !(String(selected || "").trim())
                              }
                              onClick={() =>
                                handleReassignUserDevice(userKey, selected)
                              }
                            >
                              {String(currentDevice || "").trim()
                                ? "Reasignar"
                                : "Asignar"}
                            </button>{" "}
                            {String(currentDevice || "").trim() ? (
                              <button
                                type="button"
                                className="btn-outline danger"
                                disabled={deviceAlumnoActionLoading}
                                style={{ marginLeft: "0.5rem" }}
                                onClick={() =>
                                  handleUnassignUserDevice(userKey)
                                }
                              >
                                Quitar
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="users-pagination">
              <button
                type="button"
                className="btn-outline"
                onClick={() => setDeviceAlumnoPage((p) => Math.max(p - 1, 1))}
                disabled={deviceAlumnoSafePage === 1 || deviceAlumnoActionLoading}
              >
                {"<"}
              </button>
              <span className="users-page-info">
                Página {deviceAlumnoSafePage} de {deviceAlumnoTotalPages}
              </span>
              <button
                type="button"
                className="btn-outline"
                onClick={() =>
                  setDeviceAlumnoPage((p) =>
                    Math.min(p + 1, deviceAlumnoTotalPages)
                  )
                }
                disabled={
                  deviceAlumnoSafePage === deviceAlumnoTotalPages ||
                  deviceAlumnoActionLoading
                }
              >
                {">"}
              </button>
            </div>
          </section>

          {/* Bloque 3: quitar reservas */}
          <section className="card reset-card">
            <h2>Quitar reserva de usuario</h2>
            <p className="subtitle">
              Elimina las fechas de inicio y fin de reserva de un usuario
              manteniendo el equipo asignado.
            </p>
            {clearConfirmOpen && (
              <div className="alert alert-error">
                <p>
                  ¿Seguro que quieres quitar la reserva de{" "}
                  <strong>{clearUser}</strong>?
                </p>
                <div className="form-actions" style={{ marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setClearConfirmOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={async () => {
                      setClearConfirmOpen(false);
                      await handleClearReservation();
                    }}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            )}
            {clearMessage && <div className="alert alert-success">{clearMessage}</div>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!clearUser) return;
                setClearConfirmOpen(true);
              }}
              className="form grid-2"
            >
              <label className="form-field">
                <span>Buscar y seleccionar usuario</span>
                <div className="device-combo">
                  <input
                    type="text"
                    className="device-combo-input"
                    value={clearUserSearch}
                    onFocus={() => setClearComboOpen(true)}
                    onBlur={() => setTimeout(() => setClearComboOpen(false), 100)}
                    onChange={(e) => {
                      setClearUserSearch(e.target.value);
                      setClearUser(e.target.value);
                      setClearComboOpen(true);
                    }}
                    placeholder="Buscar por usuario o correo..."
                    required
                  />
                  {clearComboOpen && (
                    <div className="device-combo-list">
                      {loadingUsers && (
                        <div className="device-combo-item muted">
                          Cargando usuarios...
                        </div>
                      )}
                      {!loadingUsers && filteredUsersForClear.length === 0 && (
                        <div className="device-combo-item muted">
                          No hay usuarios que coincidan.
                        </div>
                      )}
                      {!loadingUsers &&
                        filteredUsersForClear.map((u) => {
                          const value = u.username || u.email;
                          return (
                            <button
                              type="button"
                              key={`clear-${u.email || u.username}`}
                              className="device-combo-item"
                              onMouseDown={(ev) => {
                                ev.preventDefault();
                                setClearUser(value);
                                setClearUserSearch(value);
                                setClearComboOpen(false);
                              }}
                            >
                              {u.username}{" "}
                              <span style={{ color: "#9ca3af" }}>
                                ({u.email})
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              </label>
              <div className="form-actions reset-actions">
                <button
                  type="submit"
                  className="btn-outline danger"
                  disabled={clearLoading}
                >
                  {clearLoading ? "Quitando..." : "Quitar reserva"}
                </button>
              </div>
            </form>
          </section>

          {/* Bloque 4: borrar cuenta de usuario */}
          <section className="card reset-card">
            <h2>Borrar cuenta de usuario</h2>
            <p className="subtitle">
              Elimina por completo la cuenta de un estudiante. Esta acción no se
              puede deshacer.
            </p>
            {deleteConfirmOpen && (
              <div className="alert alert-error">
                <p>
                  ¿Seguro que quieres borrar la cuenta de{" "}
                  <strong>{deleteUserName}</strong>?
                </p>
                <div className="form-actions" style={{ marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => setDeleteConfirmOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={async () => {
                      setDeleteConfirmOpen(false);
                      await handleDeleteUser();
                    }}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            )}
            {deleteMessage && (
              <div className="alert alert-success">{deleteMessage}</div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!deleteUserName) return;
                setDeleteConfirmOpen(true);
              }}
              className="form grid-2"
            >
              <label className="form-field">
                <span>Buscar y seleccionar usuario</span>
                <div className="device-combo">
                  <input
                    type="text"
                    className="device-combo-input"
                    value={deleteUserSearch}
                    onFocus={() => setDeleteComboOpen(true)}
                    onBlur={() => setTimeout(() => setDeleteComboOpen(false), 100)}
                    onChange={(e) => {
                      setDeleteUserSearch(e.target.value);
                      setDeleteUserName(e.target.value);
                      setDeleteComboOpen(true);
                    }}
                    placeholder="Buscar por usuario o correo..."
                    required
                  />
                  {deleteComboOpen && (
                    <div className="device-combo-list">
                      {loadingUsers && (
                        <div className="device-combo-item muted">
                          Cargando usuarios...
                        </div>
                      )}
                      {!loadingUsers && filteredUsersForDelete.length === 0 && (
                        <div className="device-combo-item muted">
                          No hay usuarios que coincidan.
                        </div>
                      )}
                      {!loadingUsers &&
                        filteredUsersForDelete.map((u) => {
                          const value = u.username || u.email;
                          return (
                            <button
                              type="button"
                              key={`delete-${u.email || u.username}`}
                              className="device-combo-item"
                              onMouseDown={(ev) => {
                                ev.preventDefault();
                                setDeleteUserName(value);
                                setDeleteUserSearch(value);
                                setDeleteComboOpen(false);
                              }}
                            >
                              {u.username}{" "}
                              <span style={{ color: "#9ca3af" }}>
                                ({u.email})
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              </label>
              <div className="form-actions reset-actions">
                <button
                  type="submit"
                  className="btn-outline danger"
                  disabled={deleteLoading}
                >
                  {deleteLoading ? "Borrando..." : "Borrar usuario"}
                </button>
              </div>
            </form>
          </section>

          {/* Bloque 5: restablecer contraseña */}
          <section className="card reset-card">
            <h2>Restablecer contraseña de usuario</h2>
            <p className="subtitle">
              Útil si un estudiante ha olvidado su contraseña. Selecciona el
              usuario y asigna una nueva contraseña temporal.
            </p>
            {resetMessage && (
              <div className="alert alert-success">{resetMessage}</div>
            )}
            <form onSubmit={handleResetPassword} className="form grid-2">
              <label className="form-field">
                <span>Buscar y seleccionar usuario</span>
                <div className="device-combo">
                  <input
                    type="text"
                    className="device-combo-input"
                    value={resetUserSearch}
                    onFocus={() => setResetComboOpen(true)}
                    onBlur={() =>
                      setTimeout(() => setResetComboOpen(false), 100)
                    }
                    onChange={(e) => {
                      setResetUserSearch(e.target.value);
                      setResetUser(e.target.value);
                      setResetComboOpen(true);
                    }}
                    placeholder="Buscar por usuario o correo..."
                    required
                  />
                  {resetComboOpen && (
                    <div className="device-combo-list">
                      {loadingUsers && (
                        <div className="device-combo-item muted">
                          Cargando usuarios...
                        </div>
                      )}
                      {!loadingUsers && filteredUsersForReset.length === 0 && (
                        <div className="device-combo-item muted">
                          No hay usuarios que coincidan.
                        </div>
                      )}
                      {!loadingUsers &&
                        filteredUsersForReset.map((u) => {
                          const value = u.username || u.email;
                          return (
                            <button
                              type="button"
                              key={`reset-${u.email || u.username}`}
                              className="device-combo-item"
                              onMouseDown={(ev) => {
                                ev.preventDefault();
                                setResetUser(value);
                                setResetUserSearch(value);
                                setResetComboOpen(false);
                              }}
                            >
                              {u.username}{" "}
                              <span style={{ color: "#9ca3af" }}>
                                ({u.email})
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              </label>

              <label className="form-field">
                <span>Nueva contraseña</span>
                <input
                  type="password"
                  value={resetPw}
                  onChange={(e) => setResetPw(e.target.value)}
                  placeholder="Nueva contraseña"
                  required
                />
              </label>

              <div className="form-actions reset-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={resetLoading}
                >
                  {resetLoading ? "Restableciendo..." : "Restablecer contraseña"}
                </button>
              </div>
            </form>
          </section>
        </>
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

