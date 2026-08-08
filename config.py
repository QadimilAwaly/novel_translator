# config.py
import os

class AppConfig:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    API_KEY_FILE = os.path.join(BASE_DIR, "api_key.txt")
    OPENROUTER_KEY_FILE = os.path.join(BASE_DIR, "openrouter_key.txt")
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
    MODELS_DIR = os.path.join(BASE_DIR, "models")
    RELEVANT_LANGUAGES = {
        "Korean": "ko", "Chinese (Simplified)": "zh", "Japanese": "ja",
        "English": "en", "French": "fr", "German": "de", "Spanish": "es",
        "Indonesian": "id", "Vietnamese": "vi", "Thai": "th",
        "Arabic": "ar", "Russian": "ru",
    }

    def __init__(self):
        self._migrate_keys_to_env()
        self._load_env_file()
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
        if not self.api_key and not self.openrouter_api_key:
            raise FileNotFoundError(
                "Neither GEMINI_API_KEY nor OPENROUTER_API_KEY was found in .env file or environment variables. At least one must be set."
            )
        self.default_prompt = self._load_default_prompt()
        if not os.path.exists(self.MODELS_DIR):
            try:
                os.makedirs(self.MODELS_DIR, exist_ok=True)
            except Exception:
                pass

    def _migrate_keys_to_env(self):
        env_file = os.path.join(self.BASE_DIR, ".env")
        gemini_key = None
        or_key = None
        
        if os.path.exists(self.API_KEY_FILE):
            try:
                with open(self.API_KEY_FILE, 'r', encoding='utf-8') as f:
                    gemini_key = f.read().strip()
            except Exception:
                pass
                
        if os.path.exists(self.OPENROUTER_KEY_FILE):
            try:
                with open(self.OPENROUTER_KEY_FILE, 'r', encoding='utf-8') as f:
                    or_key = f.read().strip()
            except Exception:
                pass
        
        if gemini_key or or_key:
            existing_env = {}
            if os.path.exists(env_file):
                try:
                    with open(env_file, 'r', encoding='utf-8') as f:
                        for line in f:
                            line = line.strip()
                            if '=' in line and not line.startswith('#'):
                                k, v = line.split('=', 1)
                                existing_env[k.strip()] = v.strip()
                except Exception:
                    pass
            
            if gemini_key and "GEMINI_API_KEY" not in existing_env:
                existing_env["GEMINI_API_KEY"] = gemini_key
            if or_key and "OPENROUTER_API_KEY" not in existing_env:
                existing_env["OPENROUTER_API_KEY"] = or_key
                
            try:
                with open(env_file, 'w', encoding='utf-8') as f:
                    for k, v in existing_env.items():
                        f.write(f"{k}={v}\n")
                print("Successfully migrated API keys to .env file.")
            except Exception as e:
                print(f"Error writing .env file during migration: {e}")
                
            if gemini_key and os.path.exists(self.API_KEY_FILE):
                try:
                    os.remove(self.API_KEY_FILE)
                except Exception:
                    pass
                    
            if or_key and os.path.exists(self.OPENROUTER_KEY_FILE):
                try:
                    os.remove(self.OPENROUTER_KEY_FILE)
                except Exception:
                    pass

    def _load_env_file(self):
        env_file = os.path.join(self.BASE_DIR, ".env")
        if not os.path.exists(env_file):
            return
        try:
            with open(env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    if '=' in line:
                        key, val = line.split('=', 1)
                        key = key.strip()
                        val = val.strip()
                        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                            val = val[1:-1]
                        os.environ[key] = val
        except Exception as e:
            print(f"Error loading .env file: {e}")

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