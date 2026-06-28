import locale
from ebooklib import epub
from bs4 import BeautifulSoup

def natural_sort_key(s):
    """
    Key function for natural sort order (alphanumeric).
    Splits the string into parts of numbers and non-numbers and converts numbers to int.
    """
    return [int(text) if text.isdigit() else text.lower()
            for text in re.split('([0-9]+)', s)]

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

    def get_translated_novels(self):
        """Returns a list of novel directory names inside translated_novels/."""
        if not os.path.exists(self.base_dir):
            return []
        novels = []
        for item in os.listdir(self.base_dir):
            full_path = os.path.join(self.base_dir, item)
            if os.path.isdir(full_path):
                novels.append(item)
        return sorted(novels, key=natural_sort_key)

    def get_novel_chapters(self, novel_title):
        """Returns a naturally sorted list of .txt chapter filenames for a given novel."""
        safe_novel_title = self._sanitize(novel_title)
        novel_dir = os.path.abspath(os.path.join(self.base_dir, safe_novel_title))
        if not novel_dir.startswith(os.path.abspath(self.base_dir)):
            raise ValueError("Unauthorized path traversal detected.")
            
        if not os.path.isdir(novel_dir):
            return []
            
        files = [f for f in os.listdir(novel_dir) if f.lower().endswith('.txt') and os.path.isfile(os.path.join(novel_dir, f))]
        return sorted(files, key=natural_sort_key)

    def compile_epub(self, novel_dir_name, novel_title, author_name, selected_files, cover_image_data=None, cover_filename=None):
        """Compiles selected text files into an EPUB."""
        safe_dir_name = self._sanitize(novel_dir_name)
        novel_dir = os.path.abspath(os.path.join(self.base_dir, safe_dir_name))
        if not novel_dir.startswith(os.path.abspath(self.base_dir)):
            raise ValueError("Unauthorized path traversal detected.")
            
        book = epub.EpubBook()
        book.set_identifier(f"id{hash(novel_title + author_name)}")
        book.set_title(novel_title)
        book.set_language('en') 
        book.add_author(author_name)

        nav_doc = epub.EpubNav()
        book.add_item(nav_doc)
        
        ncx_doc = epub.EpubNcx()
        book.add_item(ncx_doc)
        epub_chapters = []
        epub_toc_links = []
        used_filenames = set()

        if cover_image_data and cover_filename:
            book.set_cover(f'images/{cover_filename}', cover_image_data, create_page=False)
            cover_page = epub.EpubHtml(title='Cover', file_name='cover.xhtml', lang='en')
            cover_page.content = f'<html><body><img src="images/{cover_filename}" alt="Cover" style="max-width: 100%; height: auto; display: block; margin: 0 auto;"/></body></html>'
            book.add_item(cover_page)
            epub_chapters.append(cover_page)
            epub_toc_links.append(epub.Link('cover.xhtml', 'Cover', 'cover'))
            

        for i, filename in enumerate(selected_files):
            # Validate that filename doesn't contain path separators to prevent traversal
            if os.path.basename(filename) != filename:
                continue
                
            file_path = os.path.join(novel_dir, filename)
            if not os.path.isfile(file_path):
                continue
                
            content = None
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except UnicodeDecodeError:
                try:
                    with open(file_path, 'r', encoding=locale.getpreferredencoding()) as f:
                        content = f.read()
                except UnicodeDecodeError:
                    try:
                        with open(file_path, 'r', encoding='latin-1') as f:
                            content = f.read()
                    except Exception:
                        continue
                        
            if content is None or not content.strip():
                continue
                
            chapter_base_name = os.path.splitext(filename)[0]
            safe_chapter_file_name = re.sub(r'[^\w\s-]', '', chapter_base_name).strip()
            safe_chapter_file_name = re.sub(r'[-\s]+', '_', safe_chapter_file_name)
            
            base_filename = safe_chapter_file_name
            counter = 1
            while safe_chapter_file_name in used_filenames:
                safe_chapter_file_name = f"{base_filename}_{counter}"
                counter += 1
            used_filenames.add(safe_chapter_file_name)
            
            formatted_content = re.sub(r'\r?\n\s*\r?\n', 'PARAGRAPH_BREAK', content)
            formatted_content = formatted_content.replace("\r\n", "<br/>")
            formatted_content = formatted_content.replace("\n", "<br/>")
            formatted_content = formatted_content.replace("PARAGRAPH_BREAK", "</p><p>")
            
            formatted_content = formatted_content.strip()
            if not formatted_content.startswith('<p>'):
                formatted_content = f"<p>{formatted_content}"
            if not formatted_content.endswith('</p>'):
                formatted_content = f"{formatted_content}</p>"
                
            final_chapter_content = f"<h1>{chapter_base_name}</h1>\n{formatted_content}"
            soup = BeautifulSoup(final_chapter_content, 'html.parser')
            chapter_content_for_epub = str(soup)
            
            c = epub.EpubHtml(title=chapter_base_name, file_name=f'chap_{safe_chapter_file_name}_{i+1}.xhtml', lang='en')
            c.content = chapter_content_for_epub
            book.add_item(c)
            epub_chapters.append(c)
            epub_toc_links.append(epub.Link(c.file_name, chapter_base_name, c.file_name.replace('.xhtml', '')))
            
        if not epub_chapters:
            raise ValueError("No chapters were successfully processed. The EPUB would be empty.")
            
        book.toc = tuple(epub_toc_links)
        book.spine = ['nav'] + epub_chapters

        safe_novel_title = re.sub(r'[^\w\s-]', '', novel_title).strip()
        safe_novel_title = re.sub(r'[-\s]+', '_', safe_novel_title)
        
        output_dir = os.path.join(os.getcwd(), "Compiled Novel")
        os.makedirs(output_dir, exist_ok=True)
        
        output_epub_filename = f"{safe_novel_title}.epub"
        output_path = os.path.join(output_dir, output_epub_filename)
        
        epub.write_epub(output_path, book, {'play_order': {'enabled': True, 'start_from': 1}})
        return output_path