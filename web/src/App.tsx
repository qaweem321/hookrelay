import { Route, Routes } from "react-router";
import { RequireGuest, RequireUser } from "./components/guards";
import { Layout } from "./components/Layout";
import { AuthPage } from "./pages/AuthPage";
import { Dashboard } from "./pages/Dashboard";
import { Deliveries } from "./pages/Deliveries";
import { DestinationDetail } from "./pages/DestinationDetail";
import { DestinationNew } from "./pages/DestinationNew";
import { Destinations } from "./pages/Destinations";
import { EventDetail } from "./pages/EventDetail";
import { Events } from "./pages/Events";
import { NotFound } from "./pages/NotFound";
import { Settings } from "./pages/Settings";
import { SourceDetail } from "./pages/SourceDetail";
import { SourceNew } from "./pages/SourceNew";
import { Sources } from "./pages/Sources";

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RequireGuest>
            <AuthPage mode="login" />
          </RequireGuest>
        }
      />
      <Route
        path="/setup"
        element={
          <RequireGuest setup>
            <AuthPage mode="setup" />
          </RequireGuest>
        }
      />
      <Route
        element={
          <RequireUser>
            <Layout />
          </RequireUser>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="events" element={<Events />} />
        <Route path="events/:id" element={<EventDetail />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="sources" element={<Sources />} />
        <Route path="sources/new" element={<SourceNew />} />
        <Route path="sources/:id" element={<SourceDetail />} />
        <Route path="destinations" element={<Destinations />} />
        <Route path="destinations/new" element={<DestinationNew />} />
        <Route path="destinations/:id" element={<DestinationDetail />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
