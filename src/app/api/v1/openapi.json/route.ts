import { json } from "@/lib/http";
import { openApiSpec } from "@/lib/openapi";
import { appUrl } from "@/lib/seo";

export function GET() {
  return json(openApiSpec(appUrl()), 200, { "Access-Control-Allow-Origin": "*" });
}
