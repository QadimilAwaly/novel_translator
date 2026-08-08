# services/translation_service.py
import re
import time
import urllib.request
import urllib.error
import json
import os

class TranslationService:
    def __init__(self, api_key, fallback_prompt_template, openrouter_api_key=None):
        self.api_key = api_key
        self.openrouter_api_key = openrouter_api_key
        self.fallback_prompt_template = fallback_prompt_template
        self._models_cache = None
        self._cache_time = 0
        self.cache_duration = 3600

    def get_gemini_models(self):
        current_time = time.time()
        if self._models_cache and (current_time - self._cache_time) < self.cache_duration:
            return self._models_cache

        local_models = []
        # Check for active running llama.cpp server model and add it dynamically
        try:
            req = urllib.request.Request("http://127.0.0.1:8080/v1/models")
            with urllib.request.urlopen(req, timeout=2) as response:
                res = json.loads(response.read().decode('utf-8'))
                models_data = res.get('data', [])
                if models_data:
                    model_id = models_data[0].get('id')
                    model_name = os.path.basename(model_id)
                    model_label = f"local: {model_name}"
                    if model_label not in local_models:
                        local_models.append(model_label)
        except Exception:
            pass

        gemini_models = []
        try:
            if self.api_key:
                url = f"https://generativelanguage.googleapis.com/v1beta/models?key={self.api_key}"
                req = urllib.request.Request(url, headers={'Content-Type': 'application/json'})
                with urllib.request.urlopen(req, timeout=10) as response:
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
                gemini_models = preferred_order + remaining
        except Exception as e:
            print(f"Skipping Gemini models fetch: {e}")
            
        openrouter_models = []
        try:
            if self.openrouter_api_key:
                url = "https://openrouter.ai/api/v1/models"
                req = urllib.request.Request(
                    url,
                    headers={
                        'Content-Type': 'application/json',
                        'Authorization': f'Bearer {self.openrouter_api_key}'
                    }
                )
                with urllib.request.urlopen(req, timeout=10) as response:
                    res = json.loads(response.read().decode('utf-8'))
                
                all_models = res.get('data', [])
                available_models = [
                    f"openrouter:{m.get('id')}" for m in all_models if m.get('id')
                ]
                preferred = [
                    'openrouter:google/gemini-2.5-flash',
                    'openrouter:google/gemini-2.5-pro',
                    'openrouter:deepseek/deepseek-chat',
                    'openrouter:anthropic/claude-3.5-sonnet',
                    'openrouter:meta-llama/llama-3.1-405b-instruct',
                    'openrouter:openai/gpt-4o-mini',
                    'openrouter:openai/gpt-4o'
                ]
                preferred_order = [m for m in preferred if m in available_models]
                remaining = sorted([m for m in available_models if m not in preferred_order])
                openrouter_models = preferred_order + remaining
        except Exception as e:
            print(f"Skipping OpenRouter models fetch: {e}")

        self._models_cache = local_models + gemini_models + openrouter_models
        self._cache_time = current_time
        return self._models_cache

    def translate_text(self, input_text, target_lang_name, selected_model_name, novel_references, cancel_flag, selected_prompt_file):
        if cancel_flag.is_set():
            return "", "Translation cancelled by user."

        try:
            if selected_model_name.startswith("local:"):
                base_url = "http://127.0.0.1:8080"
                
                reference_section = ""
                if novel_references:
                    reference_section = f"**Novel References:**\nUse the following references:\n---\n{novel_references}\n---"
                
                prompt = self._build_prompt(input_text, target_lang_name, reference_section, selected_prompt_file)
                
                payload = {
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.3
                }
                
                url = f"{base_url}/v1/chat/completions"
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode('utf-8'),
                    headers={'Content-Type': 'application/json'},
                    method='POST'
                )
                
                with urllib.request.urlopen(req, timeout=300) as response:
                    res_data = json.loads(response.read().decode('utf-8'))
                    
                if cancel_flag.is_set():
                    return "", "Translation cancelled by user."
                    
                choices = res_data.get('choices', [])
                if not choices:
                    raise RuntimeError("No translation choices were returned by llama-server.")
                text = choices[0].get('message', {}).get('content', '')
                return self._parse_response(text)

            if selected_model_name.startswith("openrouter:"):
                real_model_name = selected_model_name.split("openrouter:", 1)[1].strip()
                
                reference_section = ""
                if novel_references:
                    reference_section = f"**Novel References:**\nUse the following references:\n---\n{novel_references}\n---"
                
                prompt = self._build_prompt(input_text, target_lang_name, reference_section, selected_prompt_file)
                
                payload = {
                    "model": real_model_name,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.3
                }
                
                url = "https://openrouter.ai/api/v1/chat/completions"
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode('utf-8'),
                    headers={
                        'Content-Type': 'application/json',
                        'Authorization': f'Bearer {self.openrouter_api_key}',
                        'HTTP-Referer': 'https://github.com/novel-translator',
                        'X-Title': 'Novel Translator'
                    },
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
                    
                choices = res_data.get('choices', [])
                if not choices:
                    error_msg = res_data.get('error', {}).get('message', 'No translation choices were returned by OpenRouter.')
                    raise RuntimeError(error_msg)
                text = choices[0].get('message', {}).get('content', '')
                return self._parse_response(text)

            # Gemini path
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