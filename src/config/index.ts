import { createConnectTransport } from "@connectrpc/connect-web";
import type { Interceptor } from "@connectrpc/connect";

// Determine environment from hostname
const parseEnvironmentFromHostname = () => {
  const hostname = window.location.hostname;
  
  if (hostname.includes(".prod.")) {
    return "production";
  } else if (hostname.includes(".dev.")) {
    return "dev";
  }
  
  return "local";
};

export const ENVIRONMENT = parseEnvironmentFromHostname();
export const API_HOST = import.meta.env.VITE_API_HOST || window.location.origin;

// Logging interceptor for Connect RPC
const loggingInterceptor: Interceptor = (next) => async (req) => {
  const startTime = Date.now();
  const methodName = `${req.service.typeName}.${req.method.name}`;
  
  if (ENVIRONMENT === "local") {
    console.log(`🔵 Request: ${methodName}`, req.message);
  }
  
  try {
    const res = await next(req);
    const duration = Date.now() - startTime;
    
    if (ENVIRONMENT === "local") {
      console.log(`🟢 Response: ${methodName} (${duration}ms)`, res.message);
    }
    
    // TODO: Add analytics tracking here
    // ReactGA.event("rpc_request", { ... });
    
    return res;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    console.error(`🔴 Error: ${methodName} (${duration}ms)`, error);
    
    // TODO: Add error tracking here
    // ReactGA.event("rpc_error", { ... });
    
    throw error;
  }
};

// Create Connect transport with interceptors
export const transport = createConnectTransport({
  baseUrl: API_HOST,
  interceptors: [loggingInterceptor],
  // TODO: Add auth headers when Discord SDK is integrated
  // headers: {
  //   "Authorization": `Bearer ${discordToken}`,
  // },
});

// Helper to get service clients
// Usage: const client = createClient(CharacterService);
export function createClient<T extends { new (...args: any[]): any }>(
  service: T
): InstanceType<T> {
  return new service(transport) as InstanceType<T>;
}