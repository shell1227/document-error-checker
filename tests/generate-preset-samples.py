"""프리셋 실파일 검증용 DOCX 12개 생성. python-docx는 테스트에만 필요합니다."""
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt

folder = Path(sys.argv[1])
folder.mkdir(parents=True, exist_ok=True)
for preset, size, spacing in [("basic", 11, 1.6), ("large", 12, 1.8), ("presentation", 24, 1.0)]:
    for case in ["match", "font-mismatch", "size-mismatch", "both-mismatch"]:
        family = "바탕" if case in ["font-mismatch", "both-mismatch"] else "맑은 고딕"
        actual_size = size + 2 if case in ["size-mismatch", "both-mismatch"] else size
        doc = Document()
        normal = doc.styles["Normal"]
        normal.font.name = family
        normal.font.size = Pt(actual_size)
        normal.element.rPr.rFonts.set(qn("w:eastAsia"), family)
        normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
        normal.paragraph_format.line_spacing = spacing
        doc.add_paragraph("서론 기본 문서 검사 문장입니다.")
        doc.add_paragraph("한글 본문과 ABC 문자를 함께 확인합니다.")
        direct = doc.add_paragraph().add_run("직접 지정한 글꼴과 크기도 검사합니다.")
        direct.font.name = family
        direct.font.size = Pt(actual_size)
        direct._element.rPr.rFonts.set(qn("w:eastAsia"), family)
        doc.save(folder / f"{preset}-{case}.docx")
print(f"Created 12 DOCX preset samples: {folder}")
