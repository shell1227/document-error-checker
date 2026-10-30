// 공통 ZIP/XML 읽기. 문서 내용은 서버로 전송하지 않습니다.
const documentReader = (() => {
  const namespaces = {
    w: ["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"],
    a: ["http://schemas.openxmlformats.org/drawingml/2006/main", "http://purl.oclc.org/ooxml/drawingml/main"],
    p: ["http://schemas.openxmlformats.org/presentationml/2006/main", "http://purl.oclc.org/ooxml/presentationml/main"]
  };
  const is = (node, prefix, name) => node?.localName === name && namespaces[prefix].includes(node.namespaceURI);
  const children = (node, prefix, name) => [...(node?.children || [])].filter((n) => is(n, prefix, name));
  const child = (node, prefix, name) => children(node, prefix, name)[0] || null;
  const all = (node, prefix, name) => [...(node?.getElementsByTagNameNS("*", name) || [])].filter((n) => is(n, prefix, name));
  const attr = (node, name) => [...(node?.attributes || [])].find((a) => a.localName === name)?.value ?? null;
  const number = (value, divisor = 1) => value === null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value) / divisor;
  const merge = (...objects) => Object.assign({}, ...objects.filter(Boolean));

  async function xml(zip, path, required = false) {
    const entry = zip.file(path);
    if (!entry) {
      if (required) throw new Error(`필수 문서 정보가 없습니다: ${path}`);
      return null;
    }
    const source = await entry.async("string");
    if (source.length > 15000000) throw new Error("문서 XML이 너무 큽니다.");
    const doc = new DOMParser().parseFromString(source, "application/xml");
    if (doc.getElementsByTagNameNS("*", "parsererror").length) throw new Error(`XML을 읽을 수 없습니다: ${path}`);
    return doc;
  }

  async function extract(file, extension) {
    if (!file) throw new Error("보관된 파일이 없습니다. 첫 화면에서 파일을 다시 선택하세요.");
    if (file.size > 20 * 1024 * 1024) throw new Error("현재는 20MB 이하 파일을 읽을 수 있습니다.");
    if (extension === "pdf") return { fileName: file.name, format: "pdf", ...await readPdf(file) };
    let zip;
    try { zip = await JSZip.loadAsync(await file.arrayBuffer()); }
    catch { throw new Error("문서를 열 수 없습니다. 암호화되지 않은 정상 DOCX·PPTX·HWPX 파일인지 확인하세요. HWP 파일은 지원하지 않습니다."); }
    const cache = new Map();
    const read = (path, required = false) => {
      if (!cache.has(path)) cache.set(path, xml(zip, path));
      return cache.get(path).then((doc) => {
        if (!doc && required) throw new Error(`필수 문서 정보가 없습니다: ${path}`);
        return doc;
      });
    };
    const result = extension === "docx" ? await readDocx(read) : extension === "pptx" ? await readPptx(read)
      : extension === "hwpx" ? await readHwpx(read) : null;
    if (!result) throw new Error("지원하지 않는 파일 형식입니다.");
    return { fileName: file.name, format: extension, ...result };
  }
  return { extract, children, child, all, attr, number, merge };
})();
