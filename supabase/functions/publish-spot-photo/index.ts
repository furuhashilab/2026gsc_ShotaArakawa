import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ADMIN = "affc8719-3bac-49ce-b251-24106f2929f4";
const PROJECT = "https://vdchpxtbqkufzscgszuh.supabase.co";
const PRIVATE = "gyoda-private-photos";
const PUBLIC = "gyoda-published-photos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PATH = /^spot-[0-9]{3,}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

function envKey(dictionary, legacy) {
  const raw = Deno.env.get(dictionary);
  return (raw ? JSON.parse(raw).default : null) || Deno.env.get(legacy);
}
function originAllowed(origin) {
  if (!origin) return true;
  if (origin === "https://furuhashilab.github.io") return true;
  try {
    const url = new URL(origin);
    return url.origin === origin && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch { return false; }
}
function validate(body) {
  if (!body || !UUID.test(body.request_id) || !/^spot-[0-9]{3,}$/.test(body.spot_id)
    || !Number.isSafeInteger(body.expected_revision) || body.expected_revision < 0
    || !Number.isSafeInteger(body.expected_photo_revision) || body.expected_photo_revision < 1
    || typeof body.expected_source !== "string" || !PATH.test(body.expected_source)
    || !body.expected_source.startsWith(body.spot_id + "/")) throw new Error("Invalid request");
  const card = body.expected_draft;
  if (!card || card.spot_id !== body.spot_id || Object.keys(card).sort().join(',') !== 'description,homepage,name,photo,spot_id,youtube,youtube2') throw new Error("Invalid card");
  for (const [field, max] of Object.entries({ name: 100, description: 3000, photo: 2000, youtube2: 2000, youtube: 2000, homepage: 2000 })) {
    if (typeof card[field] !== 'string' || card[field].length > max) throw new Error("Invalid card field");
  }
  if (!card.name.trim()) throw new Error("Name required");
  for (const field of ['photo','youtube2','youtube','homepage']) {
    const value = card[field].trim();
    if (!value) continue;
    if (field === 'photo' && /^(\.\/)?assets\/[a-zA-Z0-9_./%\-]+$/.test(value) && !value.includes('..')) continue;
    const url = new URL(value);
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error("Invalid URL");
    if (field.startsWith('youtube')) {
      let id = '';
      if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
      if (['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)) id = url.pathname === '/watch' ? url.searchParams.get('v') || '' : url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)\/?$/)?.[1] || '';
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error("Invalid YouTube URL");
    }
  }
  return body;
}
async function readBody(req) {
  if (!req.headers.get('content-type')?.includes('application/json')) throw new Error('JSON required');
  const reader = req.body?.getReader();
  if (!reader) throw new Error('Body required');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 65536) { await reader.cancel(); throw new Error('Body too large'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return validate(JSON.parse(new TextDecoder().decode(bytes)));
}
async function imageBytes(blob, path) {
  if (!(blob instanceof Blob) || blob.size < 12 || blob.size > 5242880) throw new Error('Invalid image size');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start,end));
  const png = [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP';
  const type = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : '';
  if (!type || type !== blob.type || !path.endsWith({ 'image/png':'.png', 'image/jpeg':'.jpg', 'image/webp':'.webp' }[type])) throw new Error('Invalid image type');
  return bytes;
}
async function sameBytes(blob, bytes) {
  if (!(blob instanceof Blob) || blob.size !== bytes.length) return false;
  const stored = new Uint8Array(await blob.arrayBuffer());
  return stored.every((value, i) => value === bytes[i]);
}

export async function handler(req) {
  const origin = req.headers.get('origin');
  const cors = { 'Access-Control-Allow-Origin': origin || 'https://furuhashilab.github.io',
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods':'POST,OPTIONS', 'Vary':'Origin', 'Cache-Control':'no-store' };
  const reply = (status, body) => Response.json(body, { status, headers: cors });
  if (!originAllowed(origin)) return new Response('Origin not allowed', { status:403 });
  if (req.method === 'OPTIONS') return new Response(null, { status:204, headers:cors });
  if (req.method !== 'POST') return reply(405, { error:'POST required' });
  const token = req.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return reply(401, { error:'Login required' });
  let service, job;
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const publicKey = envKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
    const secretKey = envKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
    if (url?.replace(/\/$/,'') !== PROJECT || !publicKey || !secretKey) return reply(503, { error:'Server configuration unavailable' });
    const options = { auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } };
    const userClient = createClient(url, publicKey, { ...options, global:{ headers:{ Authorization:`Bearer ${token}` } } });
    const auth = await userClient.auth.getUser(token);
    if (auth.error || !auth.data.user) return reply(401, { error:'Login required' });
    if (auth.data.user.id !== ADMIN) return reply(403, { error:'Administrator required' });
    let body;
    try { body = await readBody(req); } catch { return reply(400,{error:'Invalid publication request'}); }
    const reserved = await userClient.rpc('prepare_spot_photo_publication', {
      p_request_id:body.request_id,p_spot_id:body.spot_id,p_expected_draft:body.expected_draft,
      p_expected_revision:body.expected_revision,p_expected_photo_revision:body.expected_photo_revision,p_expected_source:body.expected_source
    });
    if (reserved.error) return reply(reserved.error.code === '40001' ? 409 : 400, {error:'Review the current draft, photo and publication again'});
    job = reserved.data;
    if (!job || job.id !== body.request_id || job.spot_id !== body.spot_id || !PATH.test(job.source_path) || !PATH.test(job.target_path)
      || job.source_path !== body.expected_source || !job.target_path.startsWith(body.spot_id + '/' + body.request_id + '.')) return reply(500,{error:'Invalid publication job'});
    if (job.status === 'completed') return reply(200,{status:'completed',result:job.result});
    if (job.status !== 'pending') return reply(409,{error:'Publication cancelled; review again'});
    service = createClient(url, secretKey, options);
    const source = await service.storage.from(PRIVATE).download(job.source_path);
    if (source.error) throw new Error('Source unavailable');
    const bytes = await imageBytes(source.data, job.source_path);
    const target = service.storage.from(PUBLIC);
    const uploaded = await target.upload(job.target_path, source.data, { contentType:source.data.type, upsert:false, cacheControl:'3600' });
    if (uploaded.error) {
      // A concurrent retry or a lost upload response may already have created it.
      const existing = await target.download(job.target_path);
      if (existing.error || !await sameBytes(existing.data, bytes)) throw new Error('Copy incomplete');
    }
    const finished = await service.rpc('finish_spot_photo_publication',{p_request_id:job.id});
    if (finished.error) throw new Error('Final response unavailable');
    if (finished.data?.status === 'completed') return reply(200,finished.data);
    if (finished.data?.status === 'rejected') {
      const cleanup = await target.remove([job.target_path]);
      return reply(409,{error:'Content changed; review again',request_id:job.id,cleanup_pending:Boolean(cleanup.error)});
    }
    throw new Error('Unexpected publication state');
  } catch {
    if (service && job?.id) {
      // Never delete a completed publication, even after an ambiguous network error.
      try {
        const settled = await service.rpc('reject_spot_photo_publication',{p_request_id:job.id});
        if (!settled.error && settled.data?.status === 'completed') return reply(200,{status:'completed',result:settled.data.result});
        if (!settled.error && settled.data?.status === 'rejected') {
          const cleanup = await service.storage.from(PUBLIC).remove([job.target_path]);
          return reply(409,{error:'Publication stopped; review again',request_id:job.id,cleanup_pending:Boolean(cleanup.error)});
        }
      } catch { /* Preserve the copy when the DB outcome cannot be confirmed. */ }
    }
    return reply(503,{error:'Publication outcome unavailable; retry the same request ID',request_id:job?.id || null});
  }
}

Deno.serve(handler);
