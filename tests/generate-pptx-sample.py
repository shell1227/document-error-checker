"""선택적 실파일 테스트: python-pptx 기본 템플릿으로 샘플을 만듭니다.

사용: python tests/generate-pptx-sample.py <저장할 임시 PPTX 경로>
서비스 실행에는 Python이나 python-pptx가 필요하지 않습니다.
"""
import sys

from pptx import Presentation
from pptx.util import Inches

presentation = Presentation()
slide = presentation.slides.add_slide(presentation.slide_layouts[1])
slide.shapes.title.text = "테마 상속 제목"
slide.placeholders[1].text = "본문 서론 결론"
paragraph = slide.placeholders[1].text_frame.add_paragraph()
paragraph.level = 1
paragraph.text = "두 번째 수준 본문"
textbox = slide.shapes.add_textbox(Inches(1), Inches(5), Inches(6), Inches(1))
textbox.text = "일반 텍스트 상자"
presentation.save(sys.argv[1])
