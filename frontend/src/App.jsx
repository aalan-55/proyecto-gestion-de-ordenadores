import { Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import StudentDashboard from "./pages/StudentDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminCalendarPage from "./pages/AdminCalendarPage.jsx";
import AdminRequestHandlePage from "./pages/AdminRequestHandlePage.jsx";
import AdminActivityPage from "./pages/AdminActivityPage.jsx";
import { useAuth } from "./state/AuthContext.jsx";
import logoEtsi from "./assets/logo-etsi.png";

function ProtectedRoute({ children, requiredLevel }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="page centered">
        <p>Cargando...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/iniciar-sesion" replace />;
  }

  if (requiredLevel && user.level !== requiredLevel) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div className="app-shell-public">
        <main className="app-main">{children}</main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar open">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img
              className="uv-logo"
              src={logoEtsi}
              alt="Universitat de València"
              loading="lazy"
            />
          </div>
        </div>

        <button
          type="button"
          className="sidebar-user sidebar-user-btn"
          onClick={() => {
            if (user.level === 2) {
              navigate("/panel-estudiante", {
                replace: true,
                state: { view: "perfil" }
              });
            } else if (user.level === 1) {
              navigate("/panel-admin", {
                replace: true,
                state: { view: "perfil" }
              });
            }
          }}
          title="Ver perfil y cambiar contraseña"
        >
          <div className="user-avatar">
            {user.username?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="user-meta">
            <div className="user-name">{user.username}</div>
            <div className="user-role">
              {user.level === 1 ? "Administrador" : "Estudiante"}
            </div>
          </div>
        </button>

        <nav className="sidebar-nav">
          {user && user.level === 2 && (
            <NavLink to="/panel-estudiante" className="sidebar-link">
              <span>Inicio</span>
            </NavLink>
          )}
          {user && user.level === 1 && (
            <>
              <NavLink to="/panel-admin/calendario" className="sidebar-link">
                <span>Gestión</span>
              </NavLink>
              <NavLink to="/panel-admin/actividad" className="sidebar-link">
                <span>Actividad</span>
              </NavLink>
              <NavLink to="/panel-admin" end className="sidebar-link">
                <span>Panel de control</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-bottom">
          <button className="btn-outline sidebar-logout" onClick={logout}>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={
            <HomeRedirect />
          }
        />
        <Route path="/iniciar-sesion" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route
          path="/panel-estudiante"
          element={
            <ProtectedRoute requiredLevel={2}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/panel-admin"
          element={
            <ProtectedRoute requiredLevel={1}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/panel-admin/calendario"
          element={
            <ProtectedRoute requiredLevel={1}>
              <AdminCalendarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/panel-admin/actividad"
          element={
            <ProtectedRoute requiredLevel={1}>
              <AdminActivityPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/panel-admin/solicitud/:userId"
          element={
            <ProtectedRoute requiredLevel={1}>
              <AdminRequestHandlePage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="page centered">
        <p>Cargando...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/iniciar-sesion" replace />;
  }

  const target =
    user.level === 1 ? "/panel-admin/calendario" : "/panel-estudiante";
  return <Navigate to={target} replace />;
}

