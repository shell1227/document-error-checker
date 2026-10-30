"""실제 PDF 테스트 파일을 임시 폴더에 생성합니다. 사용자의 문서는 사용하지 않습니다."""
import io
import sys
from pathlib import Path
from PIL import Image, ImageDraw
from reportlab.pdfgen.canvas import Canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, NumberObject

folder = Path(sys.argv[1])
folder.mkdir(parents=True, exist_ok=True)

c = Canvas(str(folder / "basic.pdf"), pagesize=(400, 500))
for text in ["Introduction Conclusion", "Reference"]:
    c.setFont("Helvetica", 12)
    c.drawString(40, 450, text)
    c.showPage()
c.save()

pdfmetrics.registerFont(TTFont("TestKorean", "C:/Windows/Fonts/malgun.ttf"))
c = Canvas(str(folder / "korean.pdf"), pagesize=(400, 500))
c.setFont("TestKorean", 12)
t = c.beginText(40, 450)
t.setFont("TestKorean", 12)
t.textOut("서")
t.textOut("론 결론 참고문헌")
c.drawText(t)
c.showPage()
c.save()

image = Image.new("RGB", (400, 120), "white")
ImageDraw.Draw(image).text((20, 30), "Introduction - image only", fill="black")
c = Canvas(str(folder / "scan.pdf"), pagesize=(400, 500))
c.drawImage(ImageReader(image), 40, 350, width=320, height=96)
c.showPage()
c.save()

c = Canvas(str(folder / "blank.pdf"), pagesize=(400, 500))
c.showPage()
c.save()

c = Canvas(str(folder / "transformed.pdf"), pagesize=(400, 500))
for y, sx, sy, angle, text in [(450, 2, 2, 0, "Scaled"), (350, 2, 1, 0, "Stretched"), (250, 1, 1, 30, "Rotated")]:
    c.saveState()
    c.translate(40, y)
    c.rotate(angle)
    c.scale(sx, sy)
    c.setFont("Helvetica", 12)
    c.drawString(0, 0, text)
    c.restoreState()
c.showPage()
c.save()

c = Canvas(str(folder / "hidden.pdf"), pagesize=(400, 500))
c.setFont("Helvetica", 12)
c.drawString(40, 450, "Visible")
t = c.beginText(40, 400)
t.setTextRenderMode(3)
t.textOut("Hidden")
c.drawText(t)
c.showPage()
c.save()

writer = PdfWriter()
writer.append(PdfReader(folder / "basic.pdf"))
writer.encrypt("test-password")
writer.write(str(folder / "encrypted.pdf"))

writer = PdfWriter()
writer.clone_document_from_reader(PdfReader(folder / "basic.pdf"))
for page in writer.pages:
    page[NameObject("/UserUnit")] = NumberObject(2)
writer.write(str(folder / "user-unit.pdf"))
print(f"Created 8 PDF fixtures in {folder}")
