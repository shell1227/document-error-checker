const assert = require("node:assert/strict");
const { createHandler } = require("../frontend/api/proofread.js");
const env = { BAREUN_API_KEY: "secret-test-key", SUPABASE_URL: "https://demo.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", BAREUN_ALLOWED_ORIGIN: "https://checker.test" };
const body = () => ({ consent: true, requestId: crypto.randomUUID(), chunks: ["할수있다."] });
async function main() {
  let calls = [], quota = true, fail = false, schema = false, wrongOffset = false, clean = false;
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/user")) return { ok: true, json: async () => ({ id: "user" }) };
    if (url.includes("/rpc/")) return { ok: true, json: async () => ({ allowed: quota }) };
    if (fail) throw new Error("secret-test-key should never leak");
    const text = JSON.parse(options.body).document.content;
    if (clean) return { ok: true, json: async () => ({ origin: text, revised: text }) };
    return { ok: true, json: async () => schema ? {} : ({ origin: text, revised: "할 수 있다.", revised_blocks: [{ origin: { content: "할수있다", begin_offset: wrongOffset ? 90 : 0, length: 0 }, revised: "할 수 있다", revisions: [{ category: "SPACING", help_id: "spacing" }] }], helps: { spacing: { comment: "띄어 씁니다." } } }) };
  };
  async function invoke(overrides = {}, settings = env) {
    let status, data;
    const res = { setHeader() {}, status(n) { status = n; return this; }, json(value) { data = value; } };
    const req = { method: "POST", headers: { origin: "https://checker.test", authorization: "Bearer test-token" }, body: body(), ...overrides };
    await createHandler(settings, fetcher)(req, res);
    assert.ok(!JSON.stringify(data).includes(env.BAREUN_API_KEY));
    return { status, data };
  }
  assert.equal((await invoke()).status, 200);
  const realCall = calls.find((c) => c.url.includes("bareun.ai"));
  assert.equal(realCall.options.headers["api-key"], env.BAREUN_API_KEY);
  assert.equal(JSON.parse(realCall.options.body).encoding_type, "UTF16");
  calls = [];
  assert.equal((await invoke({ method: "GET" })).status, 405);
  assert.equal((await invoke({ headers: { origin: "https://other.test" } })).status, 403);
  assert.equal((await invoke({}, { ...env, BAREUN_API_KEY: "" })).status, 503);
  assert.equal((await invoke({ body: { ...body(), consent: false } })).status, 400);
  assert.equal((await invoke({ body: { ...body(), chunks: ["가".repeat(1001)] } })).status, 400);
  assert.equal((await invoke({ body: { ...body(), chunks: ["가", "나", "다", "라"] } })).status, 400);
  assert.equal((await invoke({ headers: { origin: "https://checker.test" } })).status, 401);
  assert.equal(calls.length, 0);
  quota = false;
  assert.equal((await invoke()).status, 429);
  assert.ok(!calls.some((c) => c.url.includes("bareun.ai")));
  quota = true; calls = []; fail = true;
  const failure = await invoke({ body: { ...body(), chunks: ["할수있다.", "뵈요."] } });
  assert.equal(failure.data.results.length, 1);
  assert.equal(failure.data.results[0].ok, false);
  assert.equal(calls.filter((c) => c.url.includes("bareun.ai")).length, 1, "실패 후 추가 호출 또는 재시도 발생");
  fail = false; schema = true;
  assert.equal((await invoke()).data.results[0].ok, false);
  schema = false; wrongOffset = true;
  const mismatch = (await invoke()).data.results[0];
  assert.equal(mismatch.findings.length, 0);
  assert.equal(mismatch.incomplete, true);
  clean = true;
  const noErrors = (await invoke()).data.results[0];
  assert.equal(noErrors.ok, true);
  assert.equal(noErrors.findings.length, 0);
  assert.equal(noErrors.incomplete, false);
  console.log("PASS: server key isolation, auth/origin/consent/input limits, quota failure blocks API, UTF16 mapping, partial failure and no automatic retries");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
