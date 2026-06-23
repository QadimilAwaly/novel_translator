# services/translation_service.py
import re
import time
import google.generativeai as genai
import os

class TranslationService:
    def __init__(self, api_key, fallback_prompt_template):
        genai.configure(api_key=api_key)
        self.fallback_prompt_template = fallback_prompt_template
        self._models_cache = None
        self._cache_time = 0
        self.cache_duration = 3600

    def get_gemini_models(self):
        current_time = time.time()
        if self._models_cache and (current_time - self._cache_time) < self.cache_duration:
            return self._models_cache

        try:
            all_models = genai.list_models()
            available_models = [
                m.name for m in all_models
                if "generateContent" in m.supported_generation_methods and
                   (m.name.startswith('models/gemini') or m.name.startswith('models/gemma'))
            ]
            # Order preference logic here
            preferred = ['models/gemini-3.1-flash', 'models/gemini-3.1-flash-lite', 'models/gemini-2.5-flash', 'models/gemini-2.5-flash-lite']
            preferred_order = [m for m in preferred if m in available_models]
            remaining = sorted([m for m in available_models if m not in preferred_order])
            
            self._models_cache = preferred_order + remaining
            self._cache_time = current_time
            return self._models_cache
        except Exception as e:
            raise RuntimeError(f"Failed to retrieve models: {e}")

    def translate_text(self, input_text, target_lang_name, selected_model_name, novel_references, cancel_flag, selected_prompt_file):
        if cancel_flag.is_set():
            return "", "Translation cancelled by user."

        try:
            model_instance = genai.GenerativeModel(selected_model_name)
            reference_section = ""
            if novel_references:
                reference_section = f"**Novel References:**\nUse the following references:\n---\n{novel_references}\n---"
            
            prompt = self._build_prompt(input_text, target_lang_name, reference_section, selected_prompt_file)
            safety_settings = [
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}
            ]

            try:
                response = model_instance.generate_content(
                    prompt,
                    safety_settings=safety_settings,
                    request_options={'timeout': 300}
                )
            except ValueError as e:
                if "request_options" in str(e):
                    response = model_instance.generate_content(prompt, safety_settings=safety_settings)
                else:
                    raise
            except TypeError:
                response = model_instance.generate_content(prompt, safety_settings=safety_settings)

            if cancel_flag.is_set():
                return "", "Translation cancelled by user."

            
            if not response.candidates or not response.candidates[0].content.parts:
                finish_reason = ""
                if response.candidates:
                    finish_reason = f" Finish reason: {response.candidates[0].finish_reason}"
                raise RuntimeError(f"No translation candidates were returned by the model.{finish_reason}")

            return self._parse_response(response.text)
        except Exception as e:
            if cancel_flag.is_set():
                return "", "Translation cancelled by user."
            raise RuntimeError(f"Translation logic error: {e}")

    def _build_prompt(self, input_text, target_lang, reference_section, prompt_file):
        template = self.fallback_prompt_template
        if prompt_file and os.path.exists(prompt_file):
            try:
                with open(prompt_file, 'r', encoding='utf-8') as f:
                    template = f.read().strip()
            except Exception:
                pass
        return template.format(target_lang_name=target_lang, reference_section=reference_section, input_text=input_text)

    def _parse_response(self, text):
        match = re.search(r'---New Reference---', text, re.IGNORECASE | re.DOTALL)
        if match:
            translation = text[:match.start()].strip()
            recommendations = text[match.end():].strip()
        else:
            translation = text.strip()
            recommendations = ""
        translation = re.sub(r'\n{3,}', '\n\n', translation.replace('\r\n', '\n')).strip()
        return translation, recommendations