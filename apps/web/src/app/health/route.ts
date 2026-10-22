// Docker and the uptime monitor call this route. It does not call the API, so an API fault does
// not make Docker restart the web app.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok" });
}
