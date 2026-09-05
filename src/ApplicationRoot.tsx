import { StrictMode } from 'react';
import App from './App';
import { ToastProvider } from './components/ui';
import { isPropCalibrationRoute } from './dev/prop-calibration/route';
import { DiscordProvider } from './discord';

export interface ApplicationRootProps {
  mode: string;
  hostname: string;
  search: string;
}

/** Keep the local calibration tool outside application providers and the
 * development StrictMode teardown probe; ordinary application startup is
 * unchanged. */
export function ApplicationRoot({
  mode,
  hostname,
  search,
}: ApplicationRootProps) {
  if (isPropCalibrationRoute(mode, hostname, search)) return <App />;
  return (
    <StrictMode>
      <DiscordProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </DiscordProvider>
    </StrictMode>
  );
}
