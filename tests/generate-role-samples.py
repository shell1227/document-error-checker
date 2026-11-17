"""영역별 검사 실파일 생성: python generate-role-samples.py <임시 폴더>"""
import sys
from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.oxml.ns import qn
from pptx import Presentation
from pptx.enum.shapes import PP_PLACEHOLDER
from pptx.enum.text import MSO_AUTO_SIZE
from pptx.util import Pt as PptPt
from pptx.oxml.xmlchemy import OxmlElement

folder = Path(sys.argv[1])
folder.mkdir(parents=True, exist_ok=True)
doc = Document()
for name, family, size, text in [
    ("Title", "맑은 고딕", 24, "문서 제목"),
    ("Heading 1", "바탕", 16, "소제목"),
    ("Normal", "굴림", 11, "본문 내용"),
]:
    style = doc.styles[name]
    style.font.name = family
    style.font.size = Pt(size)
    style.element.rPr.rFonts.set(qn("w:eastAsia"), family)
    # 동일 요소의 테마 글꼴이 직접 이름보다 우선하므로 테스트의 지정값을 명확히 합니다.
    for key in ["asciiTheme", "hAnsiTheme", "eastAsiaTheme", "cstheme"]:
        style.element.rPr.rFonts.attrib.pop(qn("w:" + key), None)
    doc.add_paragraph(text, style=name)
doc.save(folder / "roles-office.docx")

prs = Presentation()
def set_text(shape, text, family, size):
    shape.text = text
    shape.text_frame.auto_size = MSO_AUTO_SIZE.NONE
    for paragraph in shape.text_frame.paragraphs:
        for run in paragraph.runs:
            run.font.name = family
            run.font.size = PptPt(size)
            ea = OxmlElement("a:ea")
            ea.set("typeface", family)
            run._r.get_or_add_rPr().append(ea)

slide = prs.slides.add_slide(prs.slide_layouts[0])
set_text(slide.shapes.title, "슬라이드 제목", "맑은 고딕", 24)
set_text(slide.placeholders[1], "부제", "바탕", 16)
layout = prs.slide_layouts[1]  # 일반적인 ‘제목 및 내용’의 콘텐츠 자리 표시자도 본문 마스터와 연결됩니다.
slide = prs.slides.add_slide(layout)
set_text(slide.shapes.title, "다음 슬라이드 제목", "맑은 고딕", 24)
body = next(p for p in slide.placeholders if p.placeholder_format.type == PP_PLACEHOLDER.OBJECT)
set_text(body, "본문 내용", "굴림", 11)
prs.save(folder / "roles-office.pptx")
print(f"Created role samples: {folder}")
