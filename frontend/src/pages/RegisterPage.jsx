import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";
import logoEtsi from "../assets/logo-etsi.png";

const TITULACIONES = [
  "GCD - Grau en Ciència de Dades",
  "GEET - Grau en Enginyeria Electrònica de Telecomunicació",
  "GEEI - Grau en Enginyeria Electrònica Industrial",
  "GEI - Grau en Enginyeria Informàtica",
  "GEM - Grau en Enginyeria Multimèdia",
  "GEQ - Grau en Enginyeria Química",
  "GET - Grau en Enginyeria Telemàtica",
  "QUI + GEQ - Doble Grau en Química i en Enginyeria Química",
  "MAT + GEI - Doble Grau en Matemàtiques i en Enginyeria Informàtica",
  "MAT + GET - Doble Grau en Matemàtiques i en Enginyeria Telemàtica",
  "Doble grau internacional en Ciència de Dades amb Palerm",
  "MBI - Màster en Bioinformàtica",
  "MCD - Màster en Ciència de Dades",
  "MASTERIA - Màster en Enginyeria Ambiental",
  "MUIE - Màster en Enginyeria Electrònica",
  "MIQUI - Màster en Enginyeria Química",
  "TWCAM - Màster en Tecnologies Web, Computació en el Núvol i Aplicacions Mòbils",
  "Màster internacional en Enginyeria Química"
];

export default function RegisterPage() {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const requestTypeRef = useRef(null);
  const titulacionRef = useRef(null);

  const [form, setForm] = useState({
    email: "",
    requestType: "PROYECTO",
    motives: "",
    course: ""
  });
  const [anteproyectoFile, setAnteproyectoFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [titulacionOpen, setTitulacionOpen] = useState(false);
  const [requestTypeOpen, setRequestTypeOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.level === 1) {
      navigate("/panel-admin", { replace: true });
    } else {
      navigate("/panel-estudiante", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const handleDocMouseDown = (e) => {
      const root = titulacionRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setTitulacionOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, []);

  useEffect(() => {
    const handleDocMouseDown = (e) => {
      const root = requestTypeRef.current;
      if (!root) return;
      if (!root.contains(e.target)) {
        setRequestTypeOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, []);

  const setRequestType = (nextType) => {
    setError("");
    setForm((prev) => ({
      ...prev,
      requestType: nextType,
      motives: nextType === "INVESTIGACION" ? prev.motives : "",
      course: nextType === "INVESTIGACION" ? "" : prev.course
    }));

    if (nextType !== "PROYECTO") {
      setAnteproyectoFile(null);
    }
    if (nextType === "INVESTIGACION") {
      setTitulacionOpen(false);
    }
    setRequestTypeOpen(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setError("");
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const normalizedEmail = String(form.email || "").trim().toLowerCase();
      const isInvestigacion = form.requestType === "INVESTIGACION";
      const isUvEmail = normalizedEmail.endsWith("@uv.es");
      const isAlumniUvEmail = normalizedEmail.endsWith("@alumni.uv.es");

      if (!normalizedEmail) {
        throw new Error("Debes indicar un correo institucional.");
      }
      if (isInvestigacion && !isUvEmail) {
        throw new Error("Para investigación debes usar un correo @uv.es.");
      }
      if (!isInvestigacion && !isAlumniUvEmail) {
        throw new Error("Para trabajo final debes usar un correo @alumni.uv.es.");
      }

      if (form.requestType !== "INVESTIGACION" && !form.course) {
        throw new Error("Debes seleccionar tu titulación.");
      }
      if (form.requestType === "PROYECTO" && !anteproyectoFile) {
        throw new Error("Debes adjuntar el anteproyecto firmado en PDF.");
      }
      if (form.requestType === "INVESTIGACION" && !form.motives.trim()) {
        throw new Error("Debes indicar el motivo de la investigación.");
      }

      const fd = new FormData();
      fd.append("email", form.email);
      fd.append("requestType", form.requestType);
      fd.append("motives", form.motives);
      if (form.requestType !== "INVESTIGACION") {
        fd.append("course", form.course);
      }
      if (form.requestType === "PROYECTO" && anteproyectoFile) {
        fd.append("anteproyecto", anteproyectoFile);
      }

      await register(fd);
      window.sessionStorage.setItem(
        "registrationNotice",
        "Te llegará al correo tu contraseña para iniciar sesión cuando tu solicitud sea aceptada."
      );
      navigate("/iniciar-sesion", {
        replace: true,
        state: {
          registrationNotice:
            "Te llegará al correo tu contraseña para iniciar sesión cuando tu solicitud sea aceptada."
        }
      });
    } catch (err) {
      setError(err.message || "No se pudo completar el registro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page centered">
      <img
        className="auth-header-logo"
        src={logoEtsi}
        alt="Universitat de València"
        loading="lazy"
      />
      <section className="card auth-card">
        <h1>Registro de estudiante</h1>
        <p className="subtitle">
          {form.requestType === "INVESTIGACION" ? (
            <>
              Registra tu cuenta con cualquier correo institucional terminado en{" "}
              <strong>@uv.es</strong>.
            </>
          ) : (
            <>
              Registra tu cuenta con el correo de <strong>@alumni.uv.es</strong>.
            </>
          )}
        </p>
        <form onSubmit={handleSubmit} className="form grid-2">
          <label className="form-field">
            <span>Correo institucional</span>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder={
                form.requestType === "INVESTIGACION"
                  ? "usuario@uv.es"
                  : "alumno@alumni.uv.es"
              }
              pattern={
                form.requestType === "INVESTIGACION"
                  ? "^[^\\s@]+@(?:[a-zA-Z0-9-]+\\.)*uv\\.es$"
                  : "^[^\\s@]+@alumni\\.uv\\.es$"
              }
              required
            />
          </label>
          <label className="form-field">
            <span>Tipo de solicitud</span>
            <div ref={requestTypeRef} className="titulacion-combo">
              <button
                type="button"
                className="titulacion-trigger"
                onClick={() => setRequestTypeOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={requestTypeOpen}
              >
                <span className="titulacion-value">
                  {form.requestType === "INVESTIGACION"
                    ? "Proyecto de investigación"
                    : "Trabajo final"}
                </span>
                <span className="titulacion-caret" aria-hidden="true">
                  ▾
                </span>
              </button>

              {requestTypeOpen && (
                <div className="titulacion-list" role="listbox">
                  <button
                    type="button"
                    className="titulacion-item"
                    role="option"
                    aria-selected={form.requestType === "PROYECTO"}
                    onClick={() => setRequestType("PROYECTO")}
                  >
                    Trabajo final
                  </button>
                  <button
                    type="button"
                    className="titulacion-item"
                    role="option"
                    aria-selected={form.requestType === "INVESTIGACION"}
                    onClick={() => setRequestType("INVESTIGACION")}
                  >
                    Proyecto de investigación
                  </button>
                </div>
              )}
            </div>
          </label>
          {form.requestType !== "INVESTIGACION" && (
            <label className="form-field full">
              <span>Titulación</span>
              <div
                ref={titulacionRef}
                className="titulacion-combo"
              >
                <button
                  type="button"
                  className="titulacion-trigger"
                  onClick={() => setTitulacionOpen((v) => !v)}
                  aria-haspopup="listbox"
                  aria-expanded={titulacionOpen}
                >
                  <span
                    className={form.course ? "titulacion-value" : "titulacion-placeholder"}
                  >
                    {form.course || "Selecciona tu titulación"}
                  </span>
                  <span className="titulacion-caret" aria-hidden="true">
                    ▾
                  </span>
                </button>

                {titulacionOpen && (
                  <div className="titulacion-list" role="listbox">
                    {TITULACIONES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="titulacion-item"
                        role="option"
                        aria-selected={form.course === t}
                        onClick={() => {
                          setError("");
                          setForm((prev) => ({ ...prev, course: t }));
                          setTitulacionOpen(false);
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>
          )}
          {form.requestType === "PROYECTO" ? (
            <>
              <label className="form-field full">
                <span>Anteproyecto firmado (PDF)</span>
                <input
                  type="file"
                  name="anteproyecto"
                  accept=".pdf,application/pdf"
                  onChange={(e) => {
                    setError("");
                    setAnteproyectoFile(e.target.files?.[0] || null);
                  }}
                  required
                />
              </label>
            </>
          ) : (
            <label className="form-field full">
              <span>Motivo de la investigación</span>
              <textarea
                name="motives"
                value={form.motives}
                onChange={handleChange}
                placeholder="Explica brevemente para qué necesitas el equipo"
                required
              />
            </label>
          )}
          {error && <div className="alert alert-error full">{error}</div>}
          <div className="form-actions full">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Registrando..." : "Registrarse"}
            </button>
          </div>
        </form>
        <p className="text-small">
          ¿Ya tienes cuenta?{" "}
          <Link to="/iniciar-sesion" className="link auth-switch-link">
            Iniciar sesión
          </Link>
        </p>
      </section>
    </div>
  );
}

