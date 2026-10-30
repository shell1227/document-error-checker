// Supabase 저장/조회는 문서 추출·검사와 독립적으로 동작합니다.
const inspectionHistory = (() => {
  const table = "inspection_records";
  const pageSize = 20;
  let client = null;
  let authTask = null;
  const configured = () => Boolean(window.documentCheckerCloudConfig?.url && window.documentCheckerCloudConfig?.publishableKey);

  function friendlyError(error) {
    if (error instanceof Error && error.historyMessage) return error;
    if (error?.name === "AuthApiError" && /anonymous.*(disabled|not allowed)/i.test(error.message || "")) return historyError("Supabase에서 익명 로그인을 활성화하세요.");
    const messages = {
      anonymous_provider_disabled: "Supabase에서 익명 로그인을 활성화하세요.",
      PGRST205: "기록 테이블이 없습니다. Supabase SQL 설정을 먼저 실행하세요.",
      "42P01": "기록 테이블이 없습니다. Supabase SQL 설정을 먼저 실행하세요.",
      "42501": "기록 접근 권한이 없습니다. Supabase RLS 정책을 확인하세요.",
      "23514": "저장 제약 조건을 확인하세요. HWPX·PDF 지원은 Supabase에서 supabase/add-hwpx-pdf.sql을 실행해야 합니다.",
      PGRST116: "기록이 없거나 이 브라우저에서 조회할 권한이 없습니다.",
      over_request_rate_limit: "요청이 많습니다. 잠시 뒤 다시 시도하세요."
    };
    return historyError(messages[error?.code] || "기록 연결에 실패했습니다. 인터넷 연결과 Supabase 설정을 확인한 뒤 다시 시도하세요.");
  }
  function historyError(message) {
    const error = new Error(message);
    error.historyMessage = true;
    return error;
  }
  function getClient() {
    if (!configured()) throw historyError("Supabase가 설정되지 않았습니다. 문서 검사는 계속 사용할 수 있습니다.");
    if (client) return client;
    const config = window.documentCheckerCloudConfig;
    let url;
    try { url = new URL(config.url); } catch { throw historyError("Supabase Project URL을 확인하세요."); }
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw historyError("Supabase Project URL은 https://프로젝트주소 형식으로 입력하세요.");
    const key = config.publishableKey.trim();
    let publicKey = key.startsWith("sb_publishable_");
    if (!publicKey) {
      try { publicKey = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "anon"; } catch { /* 공개 키가 아닙니다. */ }
    }
    if (!publicKey) throw historyError("publishable 키 또는 legacy anon 공개 키만 사용하세요. secret/service_role 키는 사용할 수 없습니다.");
    if (!window.supabase?.createClient) throw historyError("기록 연결 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.");
    try {
      localStorage.setItem("documentCheckerStorageTest", "1");
      localStorage.removeItem("documentCheckerStorageTest");
    } catch { throw historyError("브라우저 저장소를 사용할 수 없어 기록 사용자를 유지할 수 없습니다. 사이트 저장소 설정을 확인하세요."); }
    client = window.supabase.createClient(url.origin, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: `document-checker-auth:${url.host}` },
      global: { fetch: async (input, options = {}) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
          const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
          return await fetch(input, { ...options, signal });
        } finally { clearTimeout(timer); }
      } }
    });
    return client;
  }
  async function authenticatedClient() {
    const db = getClient();
    if (!authTask) {
      authTask = (async () => {
        const { data, error } = await db.auth.getSession();
        if (error) throw error;
        if (!data.session) {
          const signedIn = await db.auth.signInAnonymously();
          if (signedIn.error) throw signedIn.error;
          if (!signedIn.data.session) throw historyError("익명 로그인 세션을 만들지 못했습니다.");
        }
      })().finally(() => { authTask = null; });
    }
    await authTask;
    return db;
  }
  function createRecord(report, setup) {
    const copy = JSON.parse(JSON.stringify(report));
    const summary = { pass: 0, fail: 0, unknown: 0 };
    copy.items.forEach((item) => {
      for (const key of Object.keys(summary)) summary[key] += item.counts[key];
    });
    return {
      id: crypto.randomUUID(), inspected_at: new Date().toISOString(),
      file_name: copy.fileName, file_format: copy.format,
      document_type: setup.documentType, inspection_items: [...setup.inspectionItems],
      criteria: copy.criteria, result: copy, summary, result_version: 1
    };
  }
  async function save(record) {
    try {
      if (new Blob([JSON.stringify(record)]).size > 2 * 1024 * 1024) throw historyError("검사 결과가 2MB를 넘어 기록을 저장하지 못했습니다. JSON 다운로드로 보관하세요.");
      const db = await authenticatedClient();
      const { error } = await db.from(table).insert(record);
      if (error?.code === "23505") {
        // 응답 유실 뒤 재시도해도 같은 검사를 중복 저장하지 않습니다.
        const existing = await db.from(table).select("id").eq("id", record.id).maybeSingle();
        if (!existing.error && existing.data?.id === record.id) return record.id;
      }
      if (error) throw error;
      return record.id;
    } catch (error) { throw friendlyError(error); }
  }
  async function list(offset = 0) {
    try {
      const db = await authenticatedClient();
      const { data, error } = await db.from(table)
        .select("id,file_name,file_format,inspected_at,summary")
        .order("inspected_at", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + pageSize);
      if (error) throw error;
      return { records: data.slice(0, pageSize), hasMore: data.length > pageSize };
    } catch (error) { throw friendlyError(error); }
  }
  async function get(id) {
    try {
      const db = await authenticatedClient();
      const { data, error } = await db.from(table).select("*").eq("id", id).single();
      if (error) throw error;
      if (data.result_version !== 1 || !data.result || !Array.isArray(data.result.items) || typeof data.result.scope !== "string") throw historyError("현재 화면에서 읽을 수 없는 검사 기록 형식입니다.");
      return data;
    } catch (error) { throw friendlyError(error); }
  }
  return { configured, createRecord, save, list, get, pageSize };
})();
