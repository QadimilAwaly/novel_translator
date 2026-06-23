# services/reference_service.py
import os
import json
import re

class ReferenceService:
    def __init__(self, folder_name="references"):
        self.folder_name = folder_name
        os.makedirs(self.folder_name, exist_ok=True)

    def _get_filename(self, novel_title):
        if not novel_title:
            return None
        safe_title = re.sub(r'[\\/:*?"<>|]', '', novel_title).replace(' ', '_').strip()
        safe_title = os.path.basename(safe_title)
        if safe_title in ('.', '..', ''):
            raise ValueError("Invalid novel title.")
        filename = os.path.abspath(os.path.join(self.folder_name, f"{safe_title}_references.json"))
        if not filename.startswith(os.path.abspath(self.folder_name)):
            raise ValueError("Unauthorized path traversal detected.")
        return filename

    def load_references(self, novel_title, input_text=None):
        filename = self._get_filename(novel_title)
        if not filename or not os.path.exists(filename):
            return ""

        try:
            with open(filename, 'r', encoding='utf-8') as f:
                data = json.load(f)
                references = data if isinstance(data, str) else ""
                
                if input_text and references:
                    references = self._filter_references(references, input_text)
                
                return references
        except json.JSONDecodeError as e:
            raise ValueError(f"Reference file for '{novel_title}' is corrupt: {e}")
        except (IOError, OSError) as e:
            raise IOError(f"Failed to load references: {e}")

    def _filter_references(self, references, input_text):
        """Filter references to only include entries that match words in the input text."""
        if not references or not input_text:
            return ""
        
        lines = references.split('\n')
        filtered_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Extract the original text before the arrow (handles both formats)
            # Format 1: "- Character Name: original -> translated [tag]"
            # Format 2: "- original -> translated [tag]"
            match = re.search(r'-\s*(?:\w+\s*:\s*)?(.+?)\s*->', line)
            if match:
                original_text = match.group(1).strip()
                # Check if the original text appears in the input
                if original_text in input_text:
                    filtered_lines.append(line)
        
        return '\n'.join(filtered_lines) if filtered_lines else ""

    def save_references(self, novel_title, references_text):
        filename = self._get_filename(novel_title)
        if not filename:
            return
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(references_text, f, ensure_ascii=False, indent=4)

    def get_saved_novel_titles(self):
        titles = []
        if os.path.exists(self.folder_name):
            for filename in os.listdir(self.folder_name):
                if filename.endswith("_references.json"):
                    title = filename.replace("_references.json", "").replace("_", " ")
                    titles.append(title)
        return sorted(titles)