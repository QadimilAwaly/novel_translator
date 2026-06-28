# services/translation_service.py
import re
import time
import urllib.request
import urllib.error
import json
import os

class TranslationService:
    def __init__(self, api_key, fallback_prompt_template):
        self.api_key = api_key
        self.fallback_prompt_template = fallback_prompt_template
        self._models_cache = None
        self._cache_time = 0
        self.cache_duration = 3600

    def get_gemini_models(self):
        current_time = time.time()
        if self._models_cache and (current_time - self._cache_time) < self.cache_duration:
            return self._models_cache

        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={self.api_key}"
            req = urllib.request.Request(url, headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=30) as response:
                res = json.loads(response.read().decode('utf-8'))
                
            all_models = res.get('models', [])
            available_models = [
                m.get('name') for m in all_models
                if "generateContent" in m.get("supportedGenerationMethods", []) and
                   (m.get('name', '').startswith('models/gemini') or m.get('name', '').startswith('models/gemma'))
            ]
            # Order preference logic here
            preferred = ['models/gemini-3.1-flash', 'models/gemini-3.1-flash-lite', 'models/gemini-2.5-flash', 'models/gemini-2.5-flash-lite']
            preferred_order = [m for m in preferred if m in available_models]
            remaining = sorted([m for m in available_models if m not in preferred_order])
            
            self._models_cache = preferred_order + remaining
            self._cache_time = current_time
            return self._models_cache
        except urllib.error.HTTPError as e:
            try:
                error_content = json.loads(e.read().decode('utf-8'))
                error_msg = error_content.get('error', {}).get('message', str(e))
            except Exception:
                error_msg = str(e)
            raise RuntimeError(f"Failed to retrieve models: {error_msg}")
        except Exception as e:
            raise RuntimeError(f"Failed to retrieve models: {e}")

    def translate_text(self, input_text, target_lang_name, selected_model_name, novel_references, cancel_flag, selected_prompt_file):
        if cancel_flag.is_set():
            return "", "Translation cancelled by user."

        try:
            if not selected_model_name.startswith('models/'):
                selected_model_name = f"models/{selected_model_name}"
                
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
            
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "safetySettings": safety_settings
            }

            url = f"https://generativelanguage.googleapis.com/v1beta/{selected_model_name}:generateContent?key={self.api_key}"
            req = urllib.request.Request(
                url, 
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'},
                method='POST'
            )

            try:
                with urllib.request.urlopen(req, timeout=300) as response:
                    res_data = json.loads(response.read().decode('utf-8'))
            except urllib.error.HTTPError as e:
                try:
                    error_content = json.loads(e.read().decode('utf-8'))
                    error_msg = error_content.get('error', {}).get('message', str(e))
                except Exception:
                    error_msg = str(e)
                raise RuntimeError(error_msg)

            if cancel_flag.is_set():
                return "", "Translation cancelled by user."
            
            candidates = res_data.get('candidates', [])
            if not candidates:
                raise RuntimeError("No translation candidates were returned by the model.")
                
            parts = candidates[0].get('content', {}).get('parts', [])
            if not parts:
                finish_reason = candidates[0].get('finishReason', '')
                raise RuntimeError(f"No translation candidates were returned by the model. Finish reason: {finish_reason}")
                
            text = "".join(part.get('text', '') for part in parts)
            return self._parse_response(text)
            
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