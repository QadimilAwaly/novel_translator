# config.py
import os

class AppConfig:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    API_KEY_FILE = os.path.join(BASE_DIR, "api_key.txt")
    PROMPT_DIR = os.path.join(BASE_DIR, "Prompt")
    DEFAULT_PROMPT_FILE_NAME = "translation_prompt_5.txt"
    DEFAULT_PROMPT_FILE = os.path.join(PROMPT_DIR, DEFAULT_PROMPT_FILE_NAME)
    KNOWN_PROMPT_FILES = [
        "translation_prompt_1.txt",
        "translation_prompt_2.txt",
        "translation_prompt_3.txt",
        "translation_prompt_4.txt",
        "translation_prompt_5.txt",
        "translation_prompt_6.txt"
    ]
    REFERENCES_DIR = os.path.join(BASE_DIR, "references")
    OUTPUT_DIR = os.path.join(BASE_DIR, "translated_novels")

    RELEVANT_LANGUAGES = {
        "Korean": "ko", "Chinese (Simplified)": "zh", "Japanese": "ja",
        "English": "en", "French": "fr", "German": "de", "Spanish": "es",
        "Indonesian": "id", "Vietnamese": "vi", "Thai": "th",
        "Arabic": "ar", "Russian": "ru",
    }

    def __init__(self):
        self.api_key = self._load_api_key()
        self.default_prompt = self._load_default_prompt()

    def _load_api_key(self):
        env_key = os.getenv("GEMINI_API_KEY")
        if env_key:
            return env_key.strip()
        if not os.path.exists(self.API_KEY_FILE):
            raise FileNotFoundError(f"API key file '{self.API_KEY_FILE}' not found.")
        with open(self.API_KEY_FILE, 'r', encoding='utf-8') as f:
            return f.read().strip()

    def _load_default_prompt(self):
        if not os.path.exists(self.DEFAULT_PROMPT_FILE):
            raise FileNotFoundError(f"Prompt template '{self.DEFAULT_PROMPT_FILE}' not found.")
        with open(self.DEFAULT_PROMPT_FILE, 'r', encoding='utf-8') as f:
            return f.read().strip()

    def get_prompt_path(self, prompt_file_name):
        if not prompt_file_name:
            return ""
        # Extract filename only to prevent relative traversal directory structures
        base_name = os.path.basename(prompt_file_name)
        candidate = os.path.abspath(os.path.join(self.PROMPT_DIR, base_name))
        
        # Verify result is inside the prompt directory and exists
        if candidate.startswith(os.path.abspath(self.PROMPT_DIR)) and os.path.exists(candidate):
            return candidate
        raise ValueError("Unauthorized prompt file path access.")