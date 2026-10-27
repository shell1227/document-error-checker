// PPTX의 서식 상속만 담당합니다. 파일명 번호를 추측하지 않고 관계 파일을 따릅니다.
async function readPptxStyles(read, presentation, slidePath, slide) {
  const { child: c, children, all, attr: a, number: n } = documentReader;
  const relPath = (path) => path.replace(/([^/]+)$/, "_rels/$1.rels");
  const targetPath = (path, target) => new URL(target, `https://document.local/${path}`).pathname.slice(1);
  async function related(path, type) {
    try {
      const rels = await read(relPath(path));
      const matches = [...(rels?.documentElement.children || [])].filter((r) => (a(r, "Type") || "").endsWith(`/${type}`));
      if (matches.length !== 1 || a(matches[0], "TargetMode") === "External" || !a(matches[0], "Target")) return null;
      const next = targetPath(path, a(matches[0], "Target"));
      const doc = await read(next);
      return doc ? { doc, path: next } : null;
    } catch { return null; } // 직접 서식을 읽을 수 있어도 상속 부분은 누락될 수 있습니다.
  }
  const layout = await related(slidePath, "slideLayout");
  const master = layout ? await related(layout.path, "slideMaster") : null;
  const theme = master ? await related(master.path, "theme") : null;
  let fontScheme = all(theme?.doc, "a", "fontScheme")[0] || null;
  let themeSource = theme?.path || "테마 없음";
  // 테마 재정의가 있으면 가장 가까운 fontScheme을 사용합니다.
  for (const part of [master, layout, { doc: slide, path: slidePath }].filter(Boolean)) {
    let relations;
    try { relations = await read(relPath(part.path)); }
    catch { fontScheme = null; themeSource = "테마 관계 읽기 실패"; continue; }
    const overrides = [...(relations?.documentElement.children || [])].filter((r) => (a(r, "Type") || "").endsWith("/themeOverride"));
    if (overrides.length) {
      const override = await related(part.path, "themeOverride");
      if (!override) { fontScheme = null; themeSource = "테마 재정의 읽기 실패"; }
      else if (all(override.doc, "a", "fontScheme").length) {
        fontScheme = all(override.doc, "a", "fontScheme")[0];
        themeSource = override.path;
      }
    }
  }
  const percent = (value) => value?.endsWith("%") ? n(value.slice(0, -1)) : n(value, 1000);
  const fraction = (value) => { const result = percent(value); return result === null ? null : result / 100; };
  function runProperties(rp) {
    const result = {};
    for (const [tag, key] of [["latin", "latin"], ["ea", "eastAsia"], ["cs", "complexScript"]]) {
      const value = a(c(rp, "a", tag), "typeface");
      if (value !== null) result[key] = value;
    }
    for (const key of ["lang", "altLang"]) if (a(rp, key) !== null) result[key] = a(rp, key);
    if (a(rp, "sz") !== null) result.fontSizePt = n(a(rp, "sz"), 100);
    return result;
  }
  function paragraphProperties(pp) {
    const result = {};
    if (a(pp, "algn") !== null) result.alignment = a(pp, "algn");
    const spacing = c(pp, "a", "lnSpc");
    if (spacing) {
      const pct = c(spacing, "a", "spcPct");
      const pts = c(spacing, "a", "spcPts");
      result.lineSpacing = pct && !pts ? { value: percent(a(pct, "val")), unit: "percent" }
        : pts && !pct ? { value: n(a(pts, "val"), 100), unit: "pt" } : null;
    }
    return result;
  }
  const placeholder = (shape) => all(shape, "p", "ph")[0] || null;
  const shapes = (part) => all(part, "p", "sp");
  const unique = (values) => values.length === 1 ? values[0] : null;
  const normalizedType = (type) => ({ ctrTitle: "title", subTitle: "body", obj: "body", chart: "body", tbl: "body", dgm: "body", media: "body", clipArt: "body", pic: "body" }[type] || type);
  const textBody = (shape) => c(shape, "p", "txBody");
  const emptyState = () => ({ run: {}, paragraph: {}, sources: {}, fit: null });
  function apply(state, values, source, kind) {
    Object.assign(state[kind], values);
    for (const key of Object.keys(values)) state.sources[key] = source;
  }
  function applyParagraph(state, pp, source) {
    apply(state, paragraphProperties(pp), source, "paragraph");
    apply(state, runProperties(c(pp, "a", "defRPr")), source, "run");
  }
  function applyList(state, list, level, source) {
    applyParagraph(state, c(list, "a", "defPPr"), `${source}/defPPr`);
    applyParagraph(state, c(list, "a", `lvl${level + 1}pPr`), `${source}/lvl${level + 1}pPr`);
  }
  // 알 수 없는 중간 상속값은 더 먼 기본값으로 메우지 않습니다. 가까운 직접 값은 다시 적용할 수 있습니다.
  function block(state, reason) {
    apply(state, { latin: null, eastAsia: null, complexScript: null, fontSizePt: null, lang: null, altLang: null }, reason, "run");
    apply(state, { alignment: null, lineSpacing: null }, reason, "paragraph");
    state.fit = null;
  }
  function applyShape(state, shape, level, source, inheritParagraph) {
    const fontRef = a(c(c(shape, ["spDef", "txDef"].includes(shape?.localName) ? "a" : "p", "style"), "a", "fontRef"), "idx");
    if (["major", "minor"].includes(fontRef)) {
      const slot = fontRef === "major" ? "mj" : "mn";
      apply(state, { latin: `+${slot}-lt`, eastAsia: `+${slot}-ea`, complexScript: `+${slot}-cs` }, `${source}/fontRef`, "run");
    }
    const body = ["spDef", "txDef"].includes(shape?.localName) ? shape : textBody(shape);
    applyList(state, c(body, "a", "lstStyle"), level, `${source}/lstStyle`);
    if (inheritParagraph) {
      const matching = children(body, "a", "p").filter((p) => (n(a(c(p, "a", "pPr"), "lvl")) ?? 0) === level);
      if (matching.length === 1) applyParagraph(state, c(matching[0], "a", "pPr"), `${source}/pPr`);
      else if (matching.length > 1) block(state, `${source}: 같은 수준의 상속 문단이 여러 개라 확정 불가`);
      // endParaRPr는 이후 입력할 문자의 서식이므로 기존 텍스트에 적용하지 않습니다.
    }
    const bodyPr = c(body, "a", "bodyPr");
    const fit = [...(bodyPr?.children || [])].find((node) => ["normAutofit", "noAutofit", "spAutoFit"].includes(node.localName));
    if (fit) {
      state.fit = fit.localName === "normAutofit"
        ? { mode: "normal", scale: a(fit, "fontScale") === null ? 1 : fraction(a(fit, "fontScale")), reduction: a(fit, "lnSpcReduction") === null ? 0 : fraction(a(fit, "lnSpcReduction")) }
        : { mode: "none", scale: 1, reduction: 0 };
      state.sources.fit = `${source}/${fit.localName}`;
      if (fit.localName === "normAutofit" && a(fit, "fontScale") === null) state.sources.fit += " (fontScale 생략 기본값 100%)";
    }
  }

  function resolveFont(token, script) {
    if (!token) return null;
    if (!token.startsWith("+")) return { name: token, source: "직접 지정 또는 상속된 글꼴 이름" };
    const match = /^\+(mj|mn)-(lt|ea|cs)$/.exec(token);
    if (!match || !fontScheme) return null;
    const collection = c(fontScheme, "a", match[1] === "mj" ? "majorFont" : "minorFont");
    const tag = { lt: "latin", ea: "ea", cs: "cs" }[match[2]];
    const fixed = a(c(collection, "a", tag), "typeface");
    if (fixed && !fixed.startsWith("+")) return { name: fixed, source: `${themeSource}/${match[1]}/${tag}` };
    if (tag !== "ea") return null;
    const supplemental = children(collection, "a", "font").filter((font) => a(font, "script") === script);
    const name = supplemental.length === 1 ? a(supplemental[0], "typeface") : null;
    return name && !name.startsWith("+") ? { name, source: `${themeSource}/${match[1]}/font[${script}]` } : null;
  }

  function forParagraph(p) {
    const pp = c(p, "a", "pPr");
    const level = n(a(pp, "lvl")) ?? 0;
    const body = p.parentElement;
    const shape = body?.parentElement;
    const ph = shape?.localName === "sp" ? placeholder(shape) : null;
    const layoutShape = ph && layout ? unique(shapes(layout.doc).filter((s) => {
      const parent = placeholder(s);
      return parent && (a(parent, "idx") || "0") === (a(ph, "idx") || "0");
    })) : null;
    const type = a(ph, "type") || a(placeholder(layoutShape), "type") || "obj";
    const masterType = normalizedType(type);
    const masterShape = ph && master ? unique(shapes(master.doc).filter((s) => {
      const parent = placeholder(s);
      return parent && (a(parent, "type") || "obj") === masterType;
    })) : null;
    const table = shape?.localName === "tc";
    const complete = !!layout && !!master && (!ph || !!layoutShape && !!masterShape) && !table;
    const state = emptyState();
    // 모든 상속 연결을 확인한 경우에만 DrawingML의 생략 기본값을 적용합니다.
    if (complete) {
      apply(state, { alignment: "l", lineSpacing: { value: 100, unit: "percent" } }, "DrawingML 기본값 (상속 연결 확인 완료)", "paragraph");
      state.fit = { mode: "none", scale: 1, reduction: 0 };
    }
    applyList(state, c(presentation.documentElement, "p", "defaultTextStyle"), level, "ppt/presentation.xml/defaultTextStyle");
    if (master) {
      const category = ph ? masterType === "title" ? "titleStyle" : masterType === "body" ? "bodyStyle" : "otherStyle" : "otherStyle";
      applyList(state, c(c(master.doc.documentElement, "p", "txStyles"), "p", category), level, `${master.path}/${category}`);
    }
    if (ph) {
      if (masterShape) applyShape(state, masterShape, level, `${master.path}/placeholder[${masterType}]`, true);
      else block(state, "대응하는 마스터 자리 표시자를 확정하지 못했습니다.");
      if (layoutShape) applyShape(state, layoutShape, level, `${layout.path}/placeholder[${a(ph, "idx") || "0"}]`, true);
      else block(state, "대응하는 레이아웃 자리 표시자를 확정하지 못했습니다.");
    } else if (!complete) block(state, table ? "표 스타일의 상속은 아직 해석하지 않습니다." : "레이아웃·마스터 연결이 없어 상속을 확정하지 못했습니다.");
    if (!ph && shape?.localName === "sp") {
      const textbox = ["1", "true"].includes(a(c(c(shape, "p", "nvSpPr"), "p", "cNvSpPr"), "txBox"));
      const objectDefault = c(all(theme?.doc, "a", "objectDefaults")[0], "a", textbox ? "txDef" : "spDef");
      if (objectDefault) applyShape(state, objectDefault, level, `${theme?.path}/objectDefaults`, false);
    }
    if (shape?.localName === "sp") applyShape(state, shape, level, `${slidePath}/shape`, false);
    else applyList(state, c(body, "a", "lstStyle"), level, `${slidePath}/textBody/lstStyle`);
    applyParagraph(state, pp, `${slidePath}/pPr`);
    return { ...state, level, placeholderType: ph ? type : null, placeholderIndex: ph ? a(ph, "idx") || "0" : null };
  }

  function forRun(state, r) {
    const values = { ...state.run, ...runProperties(c(r, "a", "rPr")) };
    const sources = { ...state.sources };
    for (const key of Object.keys(runProperties(c(r, "a", "rPr")))) sources[key] = `${slidePath}/rPr`;
    const resolvedFonts = {};
    for (const script of ["latin", "Hang", "Jpan", "Hans", "Hant", "Han"]) {
      const key = script === "latin" ? "latin" : "eastAsia";
      const resolved = resolveFont(values[key], script);
      resolvedFonts[script] = resolved ? { ...resolved, source: `${sources[key]} → ${resolved.source}` } : null;
    }
    const scale = state.fit?.scale;
    const fontSizeResolved = state.fit?.mode === "none" || (typeof scale === "number" && scale > 0 && scale <= 1);
    const declaredFontSizePt = values.fontSizePt ?? null;
    return { fontSettings: values, resolvedFonts, formatSources: sources, declaredFontSizePt,
      fontFamily: resolvedFonts.Hang?.name || resolvedFonts.latin?.name || null,
      fontSizePt: fontSizeResolved && declaredFontSizePt !== null ? declaredFontSizePt * scale : null,
      fontSizeResolved, automaticFit: state.fit?.mode !== "none", fontScale: scale ?? null };
  }
  function spacing(state) {
    const value = state.paragraph.lineSpacing;
    if (!value || !state.fit || !(typeof state.fit.scale === "number" && state.fit.scale > 0 && state.fit.scale <= 1)) return null;
    const reduction = state.fit.reduction;
    if (typeof reduction !== "number" || reduction < 0 || reduction >= 1) return null;
    return value.unit === "percent" ? { ...value, value: value.value === null ? null : value.value * (1 - reduction) } : value;
  }
  return { forParagraph, forRun, spacing };
}
