# services/export_service.py
import os
import re

class ExportService:
    def __init__(self, base_dir="translated_novels"):
        self.base_dir = base_dir

    def _sanitize(self, val):
        cleaned = re.sub(r'[\\/:*?"<>|]', '', val).strip()
        base = os.path.basename(cleaned)
        if base in ('.', '..', ''):
            raise ValueError("Invalid path segment.")
        return base

    def save_chapter(self, novel_title, chapter_number, text):
        safe_novel_title = self._sanitize(novel_title)
        safe_chapter_number = self._sanitize(chapter_number)

        file_path = self.get_chapter_path(novel_title, chapter_number)
        novel_dir = os.path.dirname(file_path)
        os.makedirs(novel_dir, exist_ok=True)

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(text)
            
        return file_path

    def get_chapter_path(self, novel_title, chapter_number):
        safe_novel_title = self._sanitize(novel_title)
        safe_chapter_number = self._sanitize(chapter_number)

        novel_dir = os.path.abspath(os.path.join(self.base_dir, safe_novel_title))
        if not novel_dir.startswith(os.path.abspath(self.base_dir)):
            raise ValueError("Unauthorized path traversal detected.")

        filename = f"{safe_novel_title}_{safe_chapter_number}.txt"
        return os.path.join(novel_dir, filename)

    def get_next_chapter_number(self, novel_title):
        safe_novel_title = self._sanitize(novel_title)

        novel_dir = os.path.abspath(os.path.join(self.base_dir, safe_novel_title))
        if not novel_dir.startswith(os.path.abspath(self.base_dir)):
            raise ValueError("Unauthorized path traversal detected.")

        if not os.path.isdir(novel_dir):
            return 1

        files = [f for f in os.listdir(novel_dir)
                 if f.startswith(f"{safe_novel_title}_") and f.lower().endswith('.txt')]
        numbers = []
        for filename in files:
            suffix = filename[len(safe_novel_title) + 1:-4]
            if suffix.isdigit():
                numbers.append(int(suffix))

        if numbers:
            return max(numbers) + 1
        return len(files) + 1