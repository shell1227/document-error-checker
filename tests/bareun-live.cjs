// 설정 완료 후에만 실행합니다. 실제 바른 호출 2회와 익명 사용자 1개를 사용합니다.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createClient } = require("../frontend/vendor/supabase.min.js");
async function main() {
  if (!process.env.BAREUN_TEST_SITE) { console.log("SKIP: BAREUN_TEST_SITE를 배포된 사이트 주소로 설정한 뒤 실행하세요. 실제 API 테스트는 수행하지 않았습니다."); return; }
  const site = new URL(process.env.BAREUN_TEST_SITE);
  assert.ok(["http:", "https:"].includes(site.protocol) && !site.username && !site.password);
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../frontend/supabase-config.js"), "utf8"), context);
  const config = context.window.documentCheckerCloudConfig;
  const db = createClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.signInAnonymously();
  if (error || !data.session) throw new Error("실제 테스트 사용자 인증에 실패했습니다.");
  const response = await fetch(`${site.origin}/api/proofread`, { method: "POST", headers: { Origin: site.origin,
    "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ consent: true, requestId: crypto.randomUUID(), chunks: ["오늘은 날씨가 맑습니다.", "저는학교에갓습니다. 내일 뵈요."] }), signal: AbortSignal.timeout(45000) });
  const result = await response.json();
  assert.equal(response.status, 200, result.message || "서버 함수가 응답하지 않습니다.");
  assert.equal(result.results?.length, 2);
  assert.ok(result.results.every((r) => r.ok === true), "바른 호출 또는 응답 해석에 실패했습니다.");
  console.log("PASS: 배포된 서버 함수 → Supabase 인증/사용량 예약 → 실제 바른 CorrectError API 연결");
  console.log(JSON.stringify(result.results.map((r, i) => ({ sentence: i + 1, candidates: r.findings.length, incomplete: r.incomplete }))));
  console.log("교정 품질은 후보 내용을 별도로 검토해야 합니다. 테스트 호출 2회가 사용량에 포함됩니다.");
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
