import { useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";
import logoEtsi from "../assets/logo-etsi.png";

export default function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [popupMessage, setPopupMessage] = useState("");

  useEffect(() => {
    if (!user) return;
    if (user.level === 1) {
      navigate("/panel-admin/calendario", { replace: true });
    } else {
      navigate("/panel-estudiante", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const storedNotice = window.sessionStorage.getItem("registrationNotice");
    if (storedNotice) {
      setPopupMessage(storedNotice);
      window.sessionStorage.removeItem("registrationNotice");
      return;
    }
    const notice = location.state?.registrationNotice;
    if (!notice) return;
    setPopupMessage(String(notice));
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(username, password);
      if (user.level === 1) {
        navigate("/panel-admin/calendario", { replace: true });
      } else {
        navigate("/panel-estudiante", { replace: true });
      }
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page centered">
      {popupMessage && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h2>Registro enviado</h2>
              <button
                type="button"
                className="btn-outline modal-close-btn"
                onClick={() => setPopupMessage("")}
              >
                X
              </button>
            </div>
            <div className="modal-body">
              <div className="alert alert-success">{popupMessage}</div>
            </div>
          </div>
        </div>
      )}
      <img
        className="auth-header-logo"
        src={logoEtsi}
        alt="Universitat de València"
        loading="lazy"
      />
      <section className="card auth-card">
        <h1>Iniciar sesión</h1>
        <p className="subtitle">
          Accede con tu usuario de la plataforma de reservas de ordenadores.
        </p>
        <form onSubmit={handleSubmit} className="form">
          <label className="form-field">
            <span>Usuario o correo institucional</span>
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setError("");
                setUsername(e.target.value);
              }}
              placeholder="Tu usuario o correo@alumni.uv.es"
              required
            />
          </label>
          <label className="form-field">
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setError("");
                setPassword(e.target.value);
              }}
              placeholder="••••••••"
              required
            />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Iniciando sesión..." : "Entrar"}
          </button>
        </form>
        <p className="text-small">
          ¿No tienes cuenta?{" "}
          <Link to="/registro" className="link auth-switch-link">
            Registrarse
          </Link>
        </p>
      </section>
    </div>
  );
}

