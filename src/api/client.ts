import type { Interceptor } from '@connectrpc/connect';
import { createClient } from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';
import { CharacterService } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';

// Get API host from environment - default to current origin if not set
const API_HOST = import.meta.env.VITE_API_HOST || window.location.origin;

// Logging interceptor for debugging
const loggingInterceptor: Interceptor = (next) => async (req) => {
  const startTime = Date.now();
  const methodName = `${req.service.typeName}.${req.method.name}`;

  if (import.meta.env.MODE === 'development') {
    console.log(`🔵 Request: ${methodName}`, req.message);
  }

  try {
    const response = await next(req);
    const duration = Date.now() - startTime;
    if (import.meta.env.MODE === 'development') {
      console.log(
        `🟢 Response: ${methodName} (${duration}ms)`,
        response.message
      );
    }

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;

    if (import.meta.env.MODE === 'development') {
      console.error(`🔴 Error: ${methodName} (${duration}ms)`, error);
    }

    throw error;
  }
};

// Create the transport
const transport = createGrpcWebTransport({
  baseUrl: API_HOST,
  interceptors: [loggingInterceptor],
});

// Create the character service client
export const characterClient = createClient(CharacterService, transport);
