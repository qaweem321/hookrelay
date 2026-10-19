import { lazy } from "react";
import { Route, Routes } from "react-router";
import { RequireGuest, RequireUser } from "./components/guards";
import { Layout } from "./components/Layout";
import { AuthPage } from "./pages/AuthPage";

// Each dashboard page is its own chunk, so the first load only downloads and runs what it shows.
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Deliveries = lazy(() => import("./pages/Deliveries").then((m) => ({ default: m.Deliveries })));
const DestinationDetail = lazy(() =>
  import("./pages/DestinationDetail").then((m) => ({ default: m.DestinationDetail })),
);
const DestinationNew = lazy(() =>
  import("./pages/DestinationNew").then((m) => ({ default: m.DestinationNew })),
);
const Destinations = lazy(() => import("./pages/Destinations").then((m) => ({ default: m.Destinations })));
const EventDetail = lazy(() => import("./pages/EventDetail").then((m) => ({ default: m.EventDetail })));
const Events = lazy(() => import("./pages/Events").then((m) => ({ default: m.Events })));
const NotFound = lazy(() => import("./pages/NotFound").then((m) => ({ default: m.NotFound })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const SourceDetail = lazy(() => import("./pages/SourceDetail").then((m) => ({ default: m.SourceDetail })));
const SourceNew = lazy(() => import("./pages/SourceNew").then((m) => ({ default: m.SourceNew })));
const Sources = lazy(() => import("./pages/Sources").then((m) => ({ default: m.Sources })));

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
