import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ChatPage } from "./pages/ChatPage";
import { CharacterViewPage } from "./pages/CharacterViewPage";
import { SessionPlayPage } from "./pages/SessionPlayPage";
import { InitiativePage } from "./pages/InitiativePage";
import { NotesPage } from "./pages/NotesPage";
import { AdminAccessPage } from "./pages/AdminAccessPage";

function LegacySheetRedirect() {
  const { characterId } = useParams();
  return <Navigate to={`/character/${characterId}`} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/character/build" element={<Navigate to="/dashboard" replace />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/character/:characterId" element={<CharacterViewPage />} />
            <Route path="/session/:campaignId" element={<SessionPlayPage />} />
            <Route path="/initiative/:campaignId" element={<InitiativePage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/admin/access" element={<AdminAccessPage />} />
            <Route path="/sheet/:characterId" element={<LegacySheetRedirect />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
