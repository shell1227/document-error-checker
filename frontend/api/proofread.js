// 서버 전용. 바른 키는 환경 변수에서만 읽고 응답·로그에 포함하지 않습니다.
function createHandler(env = process.env, fetcher = fetch) {
  async function request(url, options) {
    const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }
  return async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    const send = (status, message) => res.status(status).json({ message });
    if (req.method !== "POST") return send(405, "POST 요청만 사용할 수 있습니다.");
    const allowed = env.BAREUN_ALLOWED_ORIGIN || `https://${env.VERCEL_PROJECT_PRODUCTION_URL || ""}`;
    if (!req.headers.origin || ![allowed, `https://${env.VERCEL_URL || ""}`].includes(req.headers.origin)) return send(403, "허용된 사이트에서만 검사할 수 있습니다.");
    if (!env.BAREUN_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return send(503, "외부 맞춤법 검사 설정이 준비되지 않았습니다. 기본 규칙 검사는 계속 사용할 수 있습니다.");
    let base;
    try { const u = new URL(env.SUPABASE_URL); if (u.protocol !== "https:" || u.pathname !== "/" || u.username || u.password || u.search || u.hash) throw 0; base = u.origin; }
    catch { return send(503, "서버 연결 설정을 확인해야 합니다."); }
    const body = req.body;
    if (!body || JSON.stringify(body).length > 12000 || body.consent !== true || !Array.isArray(body.chunks) || body.chunks.length < 1 || body.chunks.length > 3 ||
      body.chunks.some((text) => typeof text !== "string" || !text.trim() || text.length > 1000) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId || "")) return send(400, "동의 여부와 검사 길이를 확인하세요. 한 번에 최대 3,000자·3회까지만 검사합니다.");
    const authorization = req.headers.authorization;
    if (typeof authorization !== "string" || !/^Bearer \S+$/.test(authorization)) return send(401, "검사 사용자 인증이 필요합니다.");
    const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: authorization, "Content-Type": "application/json" };
    try { const user = await request(`${base}/auth/v1/user`, { headers }); if (!user.id) throw 0; }
    catch { return send(401, "사용자 인증을 확인하지 못했습니다. 기본 규칙 검사를 이용하거나 새로고침하세요."); }
    // 메모리 카운터는 서버 재시작·동시 실행 시 초기화되므로 DB에서 먼저 사용량을 예약합니다.
    let quota;
    try { quota = await request(`${base}/rest/v1/rpc/reserve_bareun_usage`, { method: "POST", headers,
      body: JSON.stringify({ p_request: body.requestId, p_calls: body.chunks.length, p_chars: body.chunks.reduce((n, s) => n + s.length, 0) }) }); }
    catch { return send(503, "호출 제한 설정을 확인하지 못해 외부 검사를 중단했습니다. Supabase의 bareun-quota.sql 설정을 확인하세요."); }
    if (quota?.allowed !== true) return send(429, "외부 검사 호출 한도 또는 1분 대기 제한에 도달했습니다. 같은 요청은 자동 재시도하지 않습니다.");
    const results = [];
    for (const text of body.chunks) {
      try {
        const data = await request("https://api.bareun.ai/bareun.RevisionService/CorrectError", {
          method: "POST", headers: { "api-key": env.BAREUN_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ document: { content: text, language: "ko-KR" }, encoding_type: "UTF16" }) });
        if (data.origin !== text || typeof data.revised !== "string") throw new Error("schema");
        // 오류가 없는 응답은 protobuf JSON에서 빈 배열 필드가 생략될 수 있습니다.
        const blocks = data.revised_blocks ?? data.revisedBlocks ?? [];
        if (!Array.isArray(blocks)) throw new Error("schema");
        const findings = [];
        let incomplete = false;
        for (const block of blocks.slice(0, 200)) {
          const original = block.origin?.content;
          const suggestion = block.revised;
          let offset = block.origin?.begin_offset ?? block.origin?.beginOffset;
          if (typeof offset === "string" && /^\d+$/.test(offset)) offset = Number(offset);
          if (typeof original !== "string" || typeof suggestion !== "string" || suggestion.length > 3000 || original.length > 1000) { incomplete = true; continue; }
          if (!Number.isInteger(offset) && original && text.indexOf(original) === text.lastIndexOf(original)) offset = text.indexOf(original);
          if (!Number.isInteger(offset) || offset < 0 || offset > text.length || text.slice(offset, offset + original.length) !== original) { incomplete = true; continue; }
          if (original === suggestion) continue;
          const revision = block.revisions?.[0];
          const help = data.helps?.[revision?.help_id ?? revision?.helpId];
          findings.push({ original, suggestion, offset, length: original.length,
            category: typeof revision?.category === "string" ? revision.category.slice(0, 60) : "UNKNOWN",
            reason: typeof help?.comment === "string" ? help.comment.slice(0, 1000) : "바른 API가 제안한 수정 후보입니다. 원문의 의미를 확인하세요." });
        }
        if (blocks.length > 200 || (data.whitespace_cleanup_ranges ?? data.whitespaceCleanupRanges)?.length || (data.revised !== text && !findings.length)) incomplete = true;
        // 부분 위치를 복원하지 못해도 전체 교정문을 '확인 필요' 제안으로 보존합니다.
        const wholeRevision = incomplete && data.revised !== text && data.revised.length <= 3000 ? data.revised : null;
        results.push({ ok: true, findings, incomplete, wholeRevision });
      } catch {
        // 한 번 실패하면 나머지 호출도 멈춥니다. 응답 본문에는 키나 원본 서버 오류를 넣지 않습니다.
        results.push({ ok: false, message: "바른 API 호출 또는 결과 해석에 실패했습니다. 키·한도·서비스 상태를 확인하세요." });
        break;
      }
    }
    return res.status(200).json({ provider: "bareun", results });
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
