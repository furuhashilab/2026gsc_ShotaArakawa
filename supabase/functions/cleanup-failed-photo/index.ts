import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ADMIN = "affc8719-3bac-49ce-b251-24106f2929f4";
const PROJECT = "https://vdchpxtbqkufzscgszuh.supabase.co";
const BUCKET = "gyoda-published-photos";
const PATH = /^spot-[0-9]{3,}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
function envKey(dictionary, legacy) {
  const raw = Deno.env.get(dictionary);
  return (raw ? JSON.parse(raw).default : null) || Deno.env.get(legacy);
}
function allowed(origin) {
  if (!origin || origin === "https://furuhashilab.github.io") return true;
  try {
    const url = new URL(origin);
    return url.origin === origin && url.protocol === "http:" && ["localhost","127.0.0.1"].includes(url.hostname);
  } catch { return false; }
}
async function body(req) {
  if (!req.headers.get("content-type")?.includes("application/json")) throw new Error("JSON required");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Body required");
  const chunks = []; let length = 0;
  try {
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) { await reader.cancel(); throw new Error("Body too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (value?.confirm_delete !== true || typeof value.object_path !== "string" || !PATH.test(value.object_path)
    || Object.keys(value).sort().join(",") !== "confirm_delete,object_path") throw new Error("Invalid deletion request");
  return value.object_path;
}

export async function handler(req) {
  const origin = req.headers.get("origin");
  if (!allowed(origin)) return new Response("Origin not allowed", {status:403});
  const headers = {"Access-Control-Allow-Origin":origin || "https://furuhashilab.github.io",
    "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods":"POST,OPTIONS",Vary:"Origin","Cache-Control":"no-store"};
  const reply = (status,value) => Response.json(value,{status,headers});
  if (req.method === "OPTIONS") return new Response(null,{status:204,headers});
  if (req.method !== "POST") return reply(405,{error:"POST required"});
  const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return reply(401,{error:"Login required"});
  let service, reservedPath;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const publicKey = envKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_ANON_KEY");
    const secretKey = envKey("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
    if (url?.replace(/\/$/,"") !== PROJECT || !publicKey || !secretKey) return reply(503,{error:"Server configuration unavailable"});
    const options = {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
    const user = createClient(url,publicKey,{...options,global:{headers:{Authorization:`Bearer ${token}`}}});
    const auth = await user.auth.getUser(token);
    if (auth.error || !auth.data.user) return reply(401,{error:"Login required"});
    if (auth.data.user.id !== ADMIN) return reply(403,{error:"Administrator required"});
    let path;
    try { path = await body(req); } catch { return reply(400,{error:"Invalid deletion request"}); }
    const reserved = await user.rpc("prepare_failed_photo_cleanup",{p_path:path});
    if (reserved.error) return reply(reserved.error.code === "40001" ? 409 : 400,{error:"Photo cannot be deleted; refresh inventory"});
    if (reserved.data?.object_name !== path || !["pending","completed"].includes(reserved.data.status)) return reply(500,{error:"Invalid deletion reservation"});
    if (reserved.data.status === "completed") return reply(200,{status:"completed",object_path:path});
    reservedPath = path;
    service = createClient(url,secretKey,options);
    // Storage API removes bytes as well as metadata. Never DELETE storage.objects via SQL.
    const removed = await service.storage.from(BUCKET).remove([path]);
    if (removed.error) throw new Error("Storage result unavailable");
    const finished = await service.rpc("finish_failed_photo_cleanup",{p_path:path});
    if (finished.error || finished.data?.status !== "completed" || finished.data.object_name !== path) throw new Error("Final result unavailable");
    return reply(200,{status:"completed",object_path:path});
  } catch {
    // A lost response may follow a successful removal. The DB verifies absence.
    if (service && reservedPath) {
      try {
        const finished = await service.rpc("finish_failed_photo_cleanup",{p_path:reservedPath});
        if (!finished.error && finished.data?.status === "completed" && finished.data.object_name === reservedPath)
          return reply(200,{status:"completed",object_path:reservedPath});
      } catch { /* Keep the reservation; retry is idempotent for the same path. */ }
    }
    return reply(503,{error:"Deletion outcome unavailable; retry the same photo",object_path:reservedPath || null});
  }
}
Deno.serve(handler);
