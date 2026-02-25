import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Layout from './components/Layout';
import Home from './pages/Home';
import YearSelect from './pages/YearSelect';
import EventDetails from './pages/EventDetails';
import TelemetryView from './pages/TelemetryView';
import UploadTelemetry from './pages/UploadTelemetry';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="telemetry" element={<YearSelect />} />
            <Route path="event/:year/:round" element={<EventDetails />} />
            <Route path="event/:year/:round/:session/:driver" element={<TelemetryView />} />
            <Route path="upload" element={<UploadTelemetry />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
