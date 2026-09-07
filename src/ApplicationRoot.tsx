import { StrictMode } from 'react';
import App from './App';
import { ToastProvider } from './components/ui';
import { isAssetReviewRoute } from './dev/asset-review/route';
import { isPropCalibrationRoute } from './dev/prop-calibration/route';
import { DiscordProvider } from './discord';

export interface ApplicationRootProps {
  mode: string;
  hostname: string;
  search: string;
}

/** Keep local WebGL review tools outside application providers and the
 * development StrictMode teardown probe; ordinary application startup is
 * unchanged. */
export function ApplicationRoot({
  mode,
  hostname,
  search,
}: ApplicationRootProps) {
  if (
    isPropCalibrationRoute(mode, hostname, search) ||
    isAssetReviewRoute(mode, hostname, search)
  ) {
    return <App />;
  }
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
