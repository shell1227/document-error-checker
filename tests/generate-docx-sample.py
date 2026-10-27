"""선택적 실파일 테스트: python generate-docx-sample.py <임시 DOCX 경로>"""
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt

document = Document()
normal = document.styles["Normal"]
normal.font.name = "맑은 고딕"
normal.font.size = Pt(12)
normal.element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")
normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
normal.paragraph_format.line_spacing = 1.6
paragraph = document.add_paragraph()
paragraph.add_run("서")
paragraph.add_run("론 결론")
document.add_paragraph("기본 서식을 상속한 본문")
document.sections[0].header.paragraphs[0].text = "참고문헌"
document.sections[0].header.paragraphs[0].style = normal
document.save(sys.argv[1])
