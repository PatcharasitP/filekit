#!/usr/bin/env python3
"""เซิร์ฟเวอร์ทดสอบที่บีบอัดเหมือนเว็บจริง

‼️ ทำไมต้องมี (พิสูจน์ 16/09/2026)
   `python3 -m http.server` ไม่บีบอัดอะไรเลย แต่ GitHub Pages ซึ่งเป็นที่อยู่จริงของเว็บ
   ส่ง gzip ทุกไฟล์ข้อความ วัดจริงแล้วต่างกันเท่าตัว
       เซิร์ฟเวอร์ทดสอบเดิม  299,825 bytes
       เว็บจริงที่ผู้ใช้เปิด  154,895 bytes  (บีบได้ 61%)
   เทสที่วัดบนเซิร์ฟเวอร์ไม่บีบ จึงวัดตัวเลขที่ไม่มีผู้ใช้คนไหนเจอ ทั้งขนาดและเวลาวาดจอแรก
   และงบที่ตั้งจากตัวเลขนั้นก็ไม่ได้บอกอะไรเกี่ยวกับประสบการณ์จริง

ใช้:  python3 tests/gzip_server.py [พอร์ต]
"""
import functools
import gzip
import http.server
import os
import socketserver
import sys

ZIP_TYPES = (".html", ".css", ".js", ".mjs", ".json", ".svg", ".txt", ".map")


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        # ‼️ ขอที่รากเว็บ (เช่น http://localhost:8901/) ต้องบีบอัดด้วย
        #    เดิมปล่อยให้ตัวแม่จัดการ ทำให้หน้าแรกส่งแบบไม่บีบ ซึ่งเป็นทางที่เทสใช้พอดี
        #    ผลคือเทสวัด FCP ได้ 592ms แทนที่จะเป็น 316ms แล้วดูเหมือนเว็บช้า ทั้งที่เซิร์ฟเวอร์ผิดเอง
        if os.path.isdir(path):
            index = os.path.join(path, "index.html")
            if os.path.isfile(index):
                path = index
            else:
                return super().send_head()
        if not os.path.isfile(path) or not path.endswith(ZIP_TYPES):
            return super().send_head()
        if "gzip" not in self.headers.get("Accept-Encoding", ""):
            return super().send_head()

        raw = open(path, "rb").read()
        body = gzip.compress(raw, 6)          # ระดับเดียวกับที่ GitHub Pages ใช้
        self.send_response(200)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")   # เทสต้องวัดการโหลดใหม่เสมอ
        self.end_headers()
        import io
        return io.BytesIO(body)

    def log_message(self, *a):
        pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), functools.partial(Handler, directory=root)) as srv:
        print(f"เสิร์ฟ {root} ที่ http://localhost:{port} แบบบีบอัด gzip")
        srv.serve_forever()


if __name__ == "__main__":
    main()
