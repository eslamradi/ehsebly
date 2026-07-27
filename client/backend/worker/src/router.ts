export type RouteHandler<Env> = (request: Request, env: Env, params: Record<string, string>) => Promise<Response>;

type Route<Env> = { method: string; pattern: URLPattern; handler: RouteHandler<Env> };

/**
 * A minimal method+path router built on URLPattern (native to the Workers
 * runtime) rather than a routing library — the household API surface is
 * ~9 routes, not enough to justify a new runtime dependency in a Worker
 * that has none today.
 */
export function createRouter<Env>() {
  const routes: Route<Env>[] = [];
  return {
    add(method: string, path: string, handler: RouteHandler<Env>): void {
      routes.push({ method, pattern: new URLPattern({ pathname: path }), handler });
    },
    async handle(request: Request, env: Env): Promise<Response | null> {
      const url = new URL(request.url);
      for (const route of routes) {
        if (route.method !== request.method) {
          continue;
        }
        const match = route.pattern.exec(url);
        if (match) {
          return route.handler(request, env, match.pathname.groups as Record<string, string>);
        }
      }
      return null;
    },
  };
}
