#!/usr/bin/env python3 --no-sandbox

import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, simpledialog
import google.generativeai as genai
import os
import threading
import re
import json
import time

# --- Configuration ---

# Tentukan jalur ke file kunci API Anda
file_path = "api_key.txt"

# Tentukan jalur ke file prompt
prompt_file_path = os.path.join("Prompt", "translation_prompt_1.txt")

# Cek apakah file ada sebelum mencoba membacanya
if not os.path.exists(file_path):
    print(f"Error: File '{file_path}' tidak ditemukan.")
    exit()

#Cek dan muat file prompt
if not os.path.exists(prompt_file_path):
    print(f"Error: File '{prompt_file_path}' tidak ditemukan.")
    exit()

try:
    # Buka file dalam mode baca ('r') dengan encoding 'utf-8'
    with open(file_path, 'r', encoding='utf-8') as f:
        GEMINI_API_KEY = f.read().strip()
    
    #Muat template prompt
    with open(prompt_file_path, 'r', encoding='utf-8') as f:
        TRANSLATION_PROMPT_TEMPLATE = f.read().strip()
    
except Exception as e:
    print(f"Error reading configuration file: {e}")
    exit()

genai.configure(api_key=GEMINI_API_KEY)

# Define Language Mappings (only relevant for output language now)
RELEVANT_LANGUAGES = {
    "Korean": "ko", "Chinese (Simplified)": "zh", "Japanese": "ja",
    "English": "en", "French": "fr", "German": "de", "Spanish": "es",
    "Indonesian": "id", "Vietnamese": "vi", "Thai": "th",
    "Arabic": "ar", "Russian": "ru",
}

class LoadingIndicator:
    """Manages a transient loading window with an optional cancel button."""
    def __init__(self, parent):
        self.parent = parent
        self.loading_window = None
        self.loading_label = None
        self.cancel_button = None

    def show(self, message="Loading...", cancel_command=None):
        if self.loading_window is None or not self.loading_window.winfo_exists():
            self.loading_window = tk.Toplevel(self.parent)
            self.loading_window.title("Please Wait")
            self.loading_window.transient(self.parent)
            self.loading_window.grab_set()

            self._center_window(self.loading_window, 500, 300)

            self.loading_window.resizable(False, False)
            self.loading_label = ttk.Label(self.loading_window, text=message, font=("Arial", 12))
            self.loading_label.pack(expand=True, pady=(10, 5))

            if cancel_command:
                self.cancel_button = ttk.Button(self.loading_window, text="Cancel", command=cancel_command)
                self.cancel_button.pack(pady=(5, 10))

            self.loading_window.protocol("WM_DELETE_WINDOW", lambda: None)
        else:
            self.loading_label.config(text=message)
            if self.cancel_button and cancel_command:
                self.cancel_button.config(command=cancel_command)
        self.parent.update_idletasks()

    def hide(self):
        if self.loading_window and self.loading_window.winfo_exists():
            self.loading_window.destroy()
            self.loading_window = None
            self.cancel_button = None

    def _center_window(self, window, width, height):
        self.parent.update_idletasks()
        root_x = self.parent.winfo_x()
        root_y = self.parent.winfo_y()
        root_width = self.parent.winfo_width()
        root_height = self.parent.winfo_height()

        x = root_x + (root_width // 2) - (width // 2)
        y = root_y + (root_height // 2) - (height // 2)
        window.geometry(f"{width}x{height}+{x}+{y}")


class ReferenceManager:
    """Manages loading and saving novel references to JSON files."""
    def __init__(self, folder_name="references"):
        self.folder_name = folder_name
        os.makedirs(self.folder_name, exist_ok=True)

    def _get_filename(self, novel_title):
        """Generates a safe filename from the novel title."""
        if not novel_title:
            return None
        safe_title = re.sub(r'[\\/:*?"<>|]', '', novel_title).replace(' ', '_')
        return os.path.join(self.folder_name, f"{safe_title}_references.json")

    def load_references(self, novel_title):
        """Loads references for a given novel title."""
        filename = self._get_filename(novel_title)
        if not filename or not os.path.exists(filename):
            return ""

        try:
            with open(filename, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, str):
                    return data
                return ""
        except json.JSONDecodeError:
            messagebox.showwarning("Warning", f"Reference file for '{novel_title}' is corrupt or empty. Loading empty references.")
            return ""
        except (IOError, OSError) as e:
            messagebox.showerror("Load References Error", f"Failed to load references for '{novel_title}': {str(e)}")
            return ""
        except Exception as e:
            messagebox.showerror("Load References Error", f"Unexpected error loading references for '{novel_title}': {str(e)}")
            return ""

    def save_references(self, novel_title, references_text):
        """Saves references for a given novel title."""
        filename = self._get_filename(novel_title)
        if not filename:
            return

        try:
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(references_text, f, ensure_ascii=False, indent=4)
        except Exception as e:
            messagebox.showerror("Save References Error", f"Failed to save references for '{novel_title}': {e}")

    def get_saved_novel_titles(self):
        """Scans the references folder and returns a list of novel titles."""
        titles = []
        for filename in os.listdir(self.folder_name):
            if filename.endswith("_references.json"):
                title = filename.replace("_references.json", "").replace("_", " ")
                titles.append(title)
        return sorted(titles)


class TranslationService:
    """Handles all interactions with the Gemini API for translation and model fetching."""
    def __init__(self):
        self._models_cache = None
        self._cache_time = 0
        self.cache_duration = 3600 # 1 hour

    def get_gemini_models(self):
        """Fetches a list of available Gemini models, caching the result."""
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

            preferred_order = []
            if 'models/gemini-1.5-flash' in available_models:
                preferred_order.append('models/gemini-1.5-flash')
            if 'models/gemini-2.5-flash' in available_models:
                preferred_order.append('models/gemini-2.5-flash')
            if 'models/gemini-2.0-flash' in available_models:
                preferred_order.append('models/gemini-2.0-flash')
            if 'models/gemini-2.5-pro' in available_models:
                preferred_order.append('models/gemini-2.5-pro')

            remaining_models = sorted([m for m in available_models if m not in preferred_order])
            final_models = preferred_order + remaining_models

            self._models_cache = final_models
            self._cache_time = current_time
            return final_models

        except Exception as e:
            raise RuntimeError(f"Failed to retrieve Gemini models: {e}. Please check your API key and internet connection.")

    def translate_text(self, input_text, target_lang_name, selected_model_name, novel_references, cancel_flag, selected_prompt_file):
        """Performs the actual translation using the selected Gemini model."""
        if cancel_flag.is_set():
            return "", "Translation cancelled by user."

        try:
            model_instance = genai.GenerativeModel(selected_model_name)
            reference_section = ""
            if novel_references:
                # Membuat format bagian referensi yang akan dimasukkan ke placeholder {reference_section} di prompt template.
                reference_section = f"""
                **Novel References:**
                Use the following references to ensure consistency in the translation.
                ---
                {novel_references}
                ---
                """
            
            prompt = self._build_translation_prompt(input_text, target_lang_name, reference_section, selected_prompt_file)
            safety_settings = [
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}
            ]
            response = model_instance.generate_content(
                prompt,
                safety_settings=safety_settings,
                request_options={'timeout': 300}
            )

            if cancel_flag.is_set():
                return "", "Translation cancelled by user."

            full_response_text = response.text
            translation_part, recommendation_part = self._parse_response(full_response_text)
            return translation_part, recommendation_part

        except Exception as e:
            if cancel_flag.is_set():
                return "", "Translation cancelled by user."
            raise RuntimeError(f"Translation error: {e}. Please check your internet connection or if the input text is too long for the model's limits. Try a shorter chapter if the error persists. Also ensure your API key is correct or try a different model.")

    def _build_translation_prompt(self, input_text, target_lang_name, reference_section, selected_prompt_file):
        """Builds the translation prompt string by loading and formatting the selected template."""
        try:
            # Load prompt template from selected file
            with open(selected_prompt_file, 'r', encoding='utf-8') as f:
                prompt_template = f.read().strip()
        except Exception as e:
            # Fallback to global template if file loading fails
            global TRANSLATION_PROMPT_TEMPLATE
            prompt_template = TRANSLATION_PROMPT_TEMPLATE
        
        # Melakukan substitusi placeholder dalam template
        prompt = prompt_template.format(
            target_lang_name=target_lang_name,
            reference_section=reference_section,
            input_text=input_text
        )
        return prompt

    def _parse_response(self, full_response_text):
        """Parses the API response to separate translation and recommendations."""
        recommendation_match = re.search(r'---New Reference---', full_response_text, re.IGNORECASE | re.DOTALL)
        if recommendation_match:
            translation_part = full_response_text[:recommendation_match.start()].strip()
            recommendation_part = full_response_text[recommendation_match.end():].strip()
        else:
            translation_part = full_response_text.strip()
            recommendation_part = ""

        translation_part = re.sub(r'\n{3,}', '\n\n', translation_part.replace('\r\n', '\n').replace('\r', '\n')).strip()
        return translation_part, recommendation_part


class ChapterInputDialog(tk.Toplevel):
    def __init__(self, parent, app_instance):
        super().__init__(parent)
        self.parent = parent
        self.app = app_instance
        self.title("Chapter Number")
        self.geometry("500x300")
        self.transient(parent)
        self.resizable(False, False)
        self.result = None

        self.label = ttk.Label(self, text="Enter Chapter Number:")
        self.label.pack(pady=10)

        self.chapter_entry = ttk.Entry(self, width=30)
        self.chapter_entry.pack(pady=5)
        self.chapter_entry.focus_set()
        self.chapter_entry.bind("<FocusIn>", lambda e: self.app._set_active_widget_by_ref(self.chapter_entry))
        self.chapter_entry.bind("<Return>", lambda event: self._on_ok())

        button_frame = ttk.Frame(self)
        button_frame.pack(pady=10)

        self.ok_button = ttk.Button(button_frame, text="OK", command=self._on_ok)
        self.ok_button.pack(side=tk.LEFT, padx=5)
        self.cancel_button = ttk.Button(button_frame, text="Cancel", command=self._on_cancel)
        self.cancel_button.pack(side=tk.LEFT, padx=5)

        self.protocol("WM_DELETE_WINDOW", self._on_cancel)
        self.parent.update_idletasks()
        self.app._center_toplevel_window(self)

        self.app.active_text_widget = self.chapter_entry
           

    def _on_ok(self):
        self.result = self.chapter_entry.get().strip()
        self.destroy()

    def _on_cancel(self):
        self.result = None
        self.destroy()

    def show(self):
        self.parent.wait_window(self)
        return self.result


class NovelTranslatorApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Novel Translator (Powered by Gemini AI)")
        self.root.geometry("800x850")

        self.loading_indicator = LoadingIndicator(root)
        self.reference_manager = ReferenceManager()
        self.translation_service = TranslationService()

        self.active_text_widget = None
        self.caps_lock_on = False
        self.keyboard_window = None

        self.cancel_translation_event = threading.Event()
        self.translation_thread = None

        self._setup_styles()
        self._create_widgets()
        self._setup_initial_state()

    def _setup_styles(self):
        self.style = ttk.Style()
        self.style.configure("Caps.TButton", background="#6fa8dc", foreground="white", font=("Arial", 9, "bold"))
        self.style.map("Caps.TButton",
                       background=[("active", "#3c78d8"), ("!active", "#6fa8dc")])
        self.style.configure("TButton", font=("Arial", 9))

    def _create_widgets(self):
        self.main_paned_window = ttk.PanedWindow(self.root, orient=tk.VERTICAL)
        self.main_paned_window.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.top_controls_frame = ttk.Frame(self.main_paned_window, padding="10")
        self.main_paned_window.add(self.top_controls_frame)

        control_grid_frame = ttk.Frame(self.top_controls_frame)
        control_grid_frame.pack(fill=tk.BOTH, expand=True)

        novel_title_frame = ttk.Frame(control_grid_frame)
        novel_title_frame.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 5))
        entry_row_frame = ttk.Frame(novel_title_frame)
        entry_row_frame.pack(anchor=tk.W, fill=tk.X)
        ttk.Label(entry_row_frame, text="Novel Title:").pack(side=tk.LEFT, padx=(0, 5))
        self.novel_title_entry = ttk.Entry(entry_row_frame, width=35)
        self.novel_title_entry.pack(side=tk.LEFT, padx=(0, 5), fill=tk.X, expand=True)
        self.novel_title_entry.bind("<Return>", self._on_novel_title_change)
        self.novel_title_entry.bind("<FocusOut>", self._on_novel_title_change)
        self.novel_title_entry.bind("<Button-1>", self._set_active_widget)
        dropdown_row_frame = ttk.Frame(novel_title_frame)
        dropdown_row_frame.pack(anchor=tk.W, fill=tk.X, pady=(5,0))
        ttk.Label(dropdown_row_frame, text="Saved Novel:").pack(side=tk.LEFT, padx=(0, 5))
        self.novel_title_dropdown = ttk.Combobox(dropdown_row_frame, values=[], state="readonly", width=25)
        self.novel_title_dropdown.pack(side=tk.LEFT, fill=tk.X, expand=True)
        self.novel_title_dropdown.bind("<<ComboboxSelected>>", self._on_novel_title_select)

        lang_model_frame = ttk.Frame(control_grid_frame)
        lang_model_frame.grid(row=1, column=0, sticky="nw", padx=(0, 20))
        output_lang_frame = ttk.Frame(lang_model_frame)
        output_lang_frame.pack(anchor=tk.W, pady=(0, 5))
        ttk.Label(output_lang_frame, text="Translate to:").pack(side=tk.LEFT, padx=(0, 5))
        self.output_language_combobox = ttk.Combobox(output_lang_frame, values=list(RELEVANT_LANGUAGES.keys()), state="readonly")
        self.output_language_combobox.set("English")
        self.output_language_combobox.pack(side=tk.LEFT)
        model_selection_frame = ttk.Frame(lang_model_frame)
        model_selection_frame.pack(anchor=tk.W, pady=(0, 5))
        ttk.Label(model_selection_frame, text="Select Model:").pack(side=tk.LEFT, padx=(0, 5))
        self.model_combobox = ttk.Combobox(model_selection_frame, values=[], state="readonly", width=30)
        self.model_combobox.pack(side=tk.LEFT)
        
        prompt_selection_frame = ttk.Frame(lang_model_frame)
        prompt_selection_frame.pack(anchor=tk.W, pady=(0, 5))
        ttk.Label(prompt_selection_frame, text="Select Prompt:").pack(side=tk.LEFT, padx=(0, 5))
        self.prompt_combobox = ttk.Combobox(prompt_selection_frame, values=[], state="readonly", width=30)
        self.prompt_combobox.pack(side=tk.LEFT)

        references_area_frame = ttk.Frame(control_grid_frame)
        references_area_frame.grid(row=2, column=0, columnspan=2, sticky="nsew", pady=(10, 0))
        control_grid_frame.grid_columnconfigure(0, weight=1)
        control_grid_frame.grid_columnconfigure(1, weight=1)
        control_grid_frame.grid_rowconfigure(1, weight=0)
        control_grid_frame.grid_rowconfigure(2, weight=1)
        references_label = ttk.Label(references_area_frame, text="Novel References:")
        references_label.pack(anchor=tk.W, pady=(0, 5))
        self.references_text_area = scrolledtext.ScrolledText(references_area_frame, wrap=tk.WORD, width=60, height=6, font=("Arial", 9))
        self.references_text_area.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        self.references_text_area.bind("<Button-1>", self._set_active_widget)
        self.references_text_area.bind("<FocusOut>", self._on_references_change)

        button_row_frame = ttk.Frame(self.top_controls_frame)
        button_row_frame.pack(fill=tk.X, pady=(10, 0))
        self.translate_button = ttk.Button(button_row_frame, text="Translate", command=self._start_translation_threaded)
        self.translate_button.pack(side=tk.LEFT, padx=(0, 10))
        self.save_output_button = ttk.Button(button_row_frame, text="Save Chapter", command=self._save_translated_text_to_file)
        self.save_output_button.pack(side=tk.LEFT, padx=(0,10))
        self.virtual_keyboard_button = ttk.Button(button_row_frame, text="Virtual Keyboard", command=self._show_virtual_keyboard)
        self.virtual_keyboard_button.pack(side=tk.LEFT)

        self.text_paned_window = ttk.PanedWindow(self.main_paned_window, orient=tk.HORIZONTAL)
        self.main_paned_window.add(self.text_paned_window)

        input_frame = ttk.Frame(self.text_paned_window)
        self.text_paned_window.add(input_frame, weight=1)
        input_label = ttk.Label(input_frame, text="Input Text:")
        input_label.pack(anchor=tk.W, pady=(0, 5))
        self.input_text_area = scrolledtext.ScrolledText(input_frame, wrap=tk.WORD, font=("Arial", 10))
        self.input_text_area.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        self.input_text_area.bind("<Button-3>", self._show_context_menu)
        self.input_text_area.bind("<Button-1>", self._set_active_widget)
        self.input_text_area.bind("<<Selection>>", self._on_selection_change)

        output_frame = ttk.Frame(self.text_paned_window)
        self.text_paned_window.add(output_frame, weight=1)
        output_label = ttk.Label(output_frame, text="Translated Text:")
        output_label.pack(anchor=tk.W, pady=(0, 5))
        self.output_text_area = scrolledtext.ScrolledText(output_frame, wrap=tk.WORD, font=("Arial", 10))
        self.output_text_area.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        self.output_text_area.bind("<Button-3>", self._show_context_menu)
        self.output_text_area.bind("<Button-1>", self._set_active_widget)
        self.output_text_area.bind("<<Selection>>", self._on_selection_change)

        self.active_text_widget = self.input_text_area

    def _setup_initial_state(self):
        self._update_novel_title_dropdown()
        self.root.after(100, self._on_novel_title_change)
        self._start_model_loading_threaded()
        self._populate_prompt_combobox()

    def _set_active_widget(self, event):
        """Sets the currently active text widget based on the click event."""
        widget = event.widget
        if isinstance(widget, (ttk.Entry, scrolledtext.ScrolledText)):
            self.active_text_widget = widget
            widget.focus_set()

    def _set_active_widget_by_ref(self, widget):
        """Sets the active widget by direct reference."""
        self.active_text_widget = widget
        widget.focus_set()

    def _on_references_change(self, event=None):
        """Saves references whenever the references text area loses focus."""
        novel_title = self.novel_title_entry.get().strip()
        if not novel_title:
            return
        
        references_text = self.references_text_area.get("1.0", tk.END).strip()
        self.reference_manager.save_references(novel_title, references_text)

    def _update_output_text(self, text, is_error=False):
        """Updates the output text area, changing color for errors."""
        self.output_text_area.delete("1.0", tk.END)
        self.output_text_area.insert(tk.END, text)
        self.output_text_area.config(fg="red" if is_error else "black")

    def _show_recommendation_popup(self, recommendation_text):
        """Displays a popup with new reference recommendations."""
        messagebox.showinfo("New Recommendations", "New reference recommendations are available! Please review them.", parent=self.root)

        popup = tk.Toplevel(self.root)
        popup.title("New Reference Recommendation")
        popup.geometry("800x1200")
        popup.transient(self.root)
        popup.grab_set()

        label = ttk.Label(popup, text="AI recommends new references.")
        label.pack(pady=10, padx=10)

        reco_text_area = scrolledtext.ScrolledText(popup, wrap=tk.WORD, width=60, height=15, font=("Arial", 9))
        reco_text_area.insert(tk.END, recommendation_text)
        reco_text_area.pack(pady=5, padx=10, fill=tk.BOTH, expand=True)

        button_frame = ttk.Frame(popup)
        button_frame.pack(pady=10)

        def save_and_close():
            current_references = self.references_text_area.get("1.0", tk.END).strip()
            new_recommendations = reco_text_area.get("1.0", tk.END).strip()

            combined_references_set = set(line.strip() for line in current_references.split('\n') if line.strip())
            for line in new_recommendations.split('\n'):
                line_stripped = line.strip()
                if line_stripped:
                    combined_references_set.add(line_stripped)

            final_references = "\n".join(sorted(list(combined_references_set)))
            self.references_text_area.delete("1.0", tk.END)
            self.references_text_area.insert(tk.END, final_references)

            novel_title = self.novel_title_entry.get().strip()
            if novel_title:
                self.reference_manager.save_references(novel_title, final_references)
            self._update_novel_title_dropdown()
            popup.destroy()

        save_button = ttk.Button(button_frame, text="Save & Close", command=save_and_close)
        save_button.pack(side=tk.LEFT, padx=5)

        cancel_button = ttk.Button(button_frame, text="Cancel", command=popup.destroy)
        cancel_button.pack(side=tk.LEFT, padx=5)
        self.root.wait_window(popup)

    def _save_translated_text_to_file(self):
        translated_text = self.output_text_area.get("1.0", tk.END).strip()
        if not translated_text:
            messagebox.showwarning("Save Error", "No translated text to save.")
            return
        
        novel_title = self.novel_title_entry.get().strip()
        if not novel_title:
            messagebox.showwarning("Save Error", "Please enter a **Novel Title** before saving.")
            return

        input_dialog = ChapterInputDialog(self.root, self)
        chapter_number = input_dialog.show()
        if not chapter_number:
            return

        safe_novel_title = re.sub(r'[\\/:*?"<>|]', '', novel_title).strip()
        safe_chapter_number = re.sub(r'[\\/:*?"<>|]', '', chapter_number).strip()
        
        if not safe_novel_title or not safe_chapter_number:
            messagebox.showwarning("Save Error", "Invalid Novel Title or Chapter Number.")
            return

        try:
            output_base_dir = "translated_novels"
            os.makedirs(output_base_dir, exist_ok=True)
            
            novel_dir = os.path.join(output_base_dir, safe_novel_title)
            os.makedirs(novel_dir, exist_ok=True)
            
            filename = f"{safe_novel_title}_{safe_chapter_number}.txt"
            file_path = os.path.join(novel_dir, filename)

            if os.path.exists(file_path):
                overwrite = messagebox.askyesno(
                    "Overwrite File?",
                    f"The file '{filename}' already exists. Overwrite?",
                    parent=self.root
                )
                if not overwrite:
                    messagebox.showinfo("Save Cancelled", "File save operation cancelled.")
                    return

            with open(file_path, "w", encoding="utf-8") as f:
                f.write(translated_text)
            messagebox.showinfo("Save Successful", f"Translated chapter saved to:\n{file_path}")
        except Exception as e:
            messagebox.showerror("Save Error", f"Failed to save the translated chapter: {str(e)}")

    def _show_context_menu(self, event):
        self.active_text_widget = event.widget
        context_menu = tk.Menu(self.active_text_widget, tearoff=0)
        context_menu.add_command(label="Copy", command=self._copy_text)
        context_menu.add_command(label="Cut", command=self._cut_text)
        context_menu.add_command(label="Paste", command=self._paste_text)
        context_menu.add_command(label="Select All", command=self._select_all_text)
        try:
            context_menu.tk_popup(event.x_root, event.y_root)
        finally:
            context_menu.grab_release()

    def _on_selection_change(self, event):
        # A simple optimization to make sure `active_text_widget` is always up-to-date
        self._set_active_widget(event)

    def _copy_text(self):
        """Copies the selected text from the active widget."""
        if not self.active_text_widget:
            return
        
        try:
            if isinstance(self.active_text_widget, scrolledtext.ScrolledText):
                if self.active_text_widget.tag_ranges(tk.SEL):
                    selected_text = self.active_text_widget.get(tk.SEL_FIRST, tk.SEL_LAST)
                    self.root.clipboard_clear()
                    self.root.clipboard_append(selected_text)
            elif isinstance(self.active_text_widget, ttk.Entry):
                try:
                    selected_text = self.active_text_widget.selection_get()
                    self.root.clipboard_clear()
                    self.root.clipboard_append(selected_text)
                except tk.TclError:
                    pass
        except (tk.TclError, AttributeError):
            pass


    def _cut_text(self):
        """Cuts the selected text from the active widget."""
        if not self.active_text_widget:
            return
        
        self._copy_text()
        
        try:
            if isinstance(self.active_text_widget, scrolledtext.ScrolledText):
                if self.active_text_widget.tag_ranges(tk.SEL):
                    self.active_text_widget.delete(tk.SEL_FIRST, tk.SEL_LAST)
            elif isinstance(self.active_text_widget, ttk.Entry):
                try:
                    self.active_text_widget.delete(tk.SEL_FIRST, tk.SEL_LAST)
                except tk.TclError:
                    pass
        except tk.TclError:
            pass

    def _paste_text(self):
        """Pastes text from the clipboard to the active widget."""
        try:
            text_to_paste = self.root.clipboard_get()
            if not text_to_paste:
                return
            
            if isinstance(self.active_text_widget, scrolledtext.ScrolledText):
                try:
                    self.active_text_widget.delete(tk.SEL_FIRST, tk.SEL_LAST)
                except tk.TclError:
                    pass
                self.active_text_widget.insert(tk.INSERT, text_to_paste)
            elif isinstance(self.active_text_widget, ttk.Entry):
                try:
                    self.active_text_widget.delete(tk.SEL_FIRST, tk.SEL_LAST)
                except tk.TclError:
                    pass
                self.active_text_widget.insert(tk.INSERT, text_to_paste)
        except (tk.TclError, AttributeError):
            pass

    def _select_all_text(self):
        if self.active_text_widget:
            if isinstance(self.active_text_widget, scrolledtext.ScrolledText):
                self.active_text_widget.tag_add(tk.SEL, "1.0", tk.END)
                self.active_text_widget.mark_set(tk.INSERT, "1.0")
                self.active_text_widget.see(tk.INSERT)
            elif isinstance(self.active_text_widget, ttk.Entry):
                self.active_text_widget.selection_range(0, tk.END)
                self.active_text_widget.icursor(tk.END)

    def _show_virtual_keyboard(self):
        if self.keyboard_window and self.keyboard_window.winfo_exists():
            self.keyboard_window.lift()
            return
        
        self.keyboard_window = tk.Toplevel(self.root)
        self.keyboard_window.title("Virtual Keyboard")
        self.keyboard_window.transient(self.root)

        keys_rows = [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
            ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
            [':','a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l','-'],
            [',', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '.']
        ]

        self.key_buttons = []
        for keys_row in keys_rows:
            frame = ttk.Frame(self.keyboard_window)
            frame.pack(pady=2)
            for key in keys_row:
                button = ttk.Button(frame, text=key, width=3, command=lambda k=key: self._on_key_press(k))
                button.pack(side=tk.LEFT, padx=1, pady=1)
                self.key_buttons.append(button)

        frame_main_special_keys = ttk.Frame(self.keyboard_window)
        frame_main_special_keys.pack(pady=2)
        self.caps_button = ttk.Button(frame_main_special_keys, text="Caps", width=5, command=self._toggle_caps_lock, style="TButton")
        self.caps_button.pack(side=tk.LEFT, padx=1, pady=1)
        ttk.Button(frame_main_special_keys, text="Space", width=10, command=lambda: self._on_key_press(' ')).pack(side=tk.LEFT, padx=1, pady=1)
        ttk.Button(frame_main_special_keys, text="Bksp", width=5, command=lambda: self._on_key_press('Bksp')).pack(side=tk.LEFT, padx=1, pady=1)
        ttk.Button(frame_main_special_keys, text="Enter", width=5, command=lambda: self._on_key_press('Enter')).pack(side=tk.LEFT, padx=1, pady=1)

        frame_ctrl_keys = ttk.Frame(self.keyboard_window)
        frame_ctrl_keys.pack(pady=2)
        ttk.Button(frame_ctrl_keys, text="Ctrl+A", width=6, command=lambda: self._on_key_press('Ctrl+A')).pack(side=tk.LEFT, padx=1, pady=1)
        ttk.Button(frame_ctrl_keys, text="Ctrl+V", width=6, command=lambda: self._on_key_press('Ctrl+V')).pack(side=tk.LEFT, padx=1, pady=1)
        ttk.Button(frame_ctrl_keys, text="Ctrl+C", width=6, command=lambda: self._on_key_press('Ctrl+C')).pack(side=tk.LEFT, padx=1, pady=1)

        self.keyboard_window.update_idletasks()
        self._center_toplevel_window(self.keyboard_window)

    def _toggle_caps_lock(self):
        self.caps_lock_on = not self.caps_lock_on
        for button in self.key_buttons:
            current_text = button.cget("text")
            if current_text.isalpha():
                button.config(text=current_text.upper() if self.caps_lock_on else current_text.lower())
        self.caps_button.config(style="Caps.TButton" if self.caps_lock_on else "TButton")

    def _on_key_press(self, key):
        widget = self.active_text_widget
        if not (widget and widget.winfo_exists()):
            return

        if key == 'Bksp':
            try:
                widget.delete(tk.SEL_FIRST, tk.SEL_LAST)
            except tk.TclError:
                if isinstance(widget, scrolledtext.ScrolledText):
                    widget.delete(f"{widget.index(tk.INSERT)}-1c", tk.INSERT)
                elif isinstance(widget, ttk.Entry):
                    current_index = widget.index(tk.INSERT)
                    if current_index > 0:
                        widget.delete(current_index - 1, current_index)
        elif key == 'Enter':
            if isinstance(widget, scrolledtext.ScrolledText):
                widget.insert(tk.INSERT, "\n")
            elif isinstance(widget, ttk.Entry):
                parent_window = widget.winfo_toplevel()
                if isinstance(parent_window, ChapterInputDialog):
                    parent_window._on_ok()
        elif key == 'Ctrl+A':
            self._select_all_text()
        elif key == 'Ctrl+V':
            try:
                text_to_paste = self.root.clipboard_get()
                if not text_to_paste:
                    return
                
                if isinstance(widget, scrolledtext.ScrolledText):
                    try:
                        widget.delete(tk.SEL_FIRST, tk.SEL_LAST)
                    except tk.TclError:
                        pass
                    widget.insert(tk.INSERT, text_to_paste)
                elif isinstance(widget, ttk.Entry):
                    try:
                        widget.delete(tk.SEL_FIRST, tk.SEL_LAST)
                    except tk.TclError:
                        pass
                    widget.insert(tk.INSERT, text_to_paste)
            except (tk.TclError, AttributeError):
                pass
        elif key == 'Ctrl+C':
            self._copy_text()
        else:
            if self.caps_lock_on and key.isalpha():
                widget.insert(tk.INSERT, key.upper())
            else:
                widget.insert(tk.INSERT, key)
            if isinstance(widget, scrolledtext.ScrolledText):
                widget.see(tk.INSERT)

    def _center_toplevel_window(self, window):
        self.root.update_idletasks()
        root_x = self.root.winfo_x()
        root_y = self.root.winfo_y()
        root_width = self.root.winfo_width()
        root_height = self.root.winfo_height()
        window.update_idletasks()
        popup_width = window.winfo_width()
        popup_height = window.winfo_height()
        x = root_x + (root_width // 2) - (popup_width // 2)
        y = root_y + (root_height // 2) - (popup_height // 2)
        window.geometry(f"+{x}+{y}")

    def _start_translation_threaded(self):
        if self.translation_thread and self.translation_thread.is_alive():
            messagebox.showwarning("Warning", "A translation is already in progress.")
            return

        input_text = self.input_text_area.get("1.0", tk.END).strip()
        novel_title = self.novel_title_entry.get().strip()
        if not input_text:
            self._update_output_text("Please enter text to translate.")
            return
        if not novel_title:
            self._update_output_text("Please enter a **Novel Title** to save and manage references.")
            return

        target_lang_name = self.output_language_combobox.get()
        selected_model_name = self.model_combobox.get()
        selected_prompt_file = self.prompt_combobox.get()
        if not target_lang_name or not selected_model_name or not selected_prompt_file:
            self._update_output_text("Please select an output language, a Gemini model, and a prompt template.")
            return

        self._set_ui_state(is_translating=True)
        self.loading_indicator.show("Preparing translation...", cancel_command=self._cancel_translation)
        
        # Simpan referensi sebelum memulai terjemahan
        self.reference_manager.save_references(novel_title, self.references_text_area.get("1.0", tk.END).strip())
        
        self.cancel_translation_event.clear()
        self.translation_thread = threading.Thread(
            target=self._perform_translation_task,
            args=(input_text, target_lang_name, selected_model_name, selected_prompt_file)
        )
        self.translation_thread.daemon = True
        self.translation_thread.start()

    def _cancel_translation(self):
        self.cancel_translation_event.set()
        self.loading_indicator.show("Cancelling translation...", cancel_command=None)
        
        if self.translation_thread and self.translation_thread.is_alive():
            self.translation_thread.join()

        self.root.after(0, self.loading_indicator.hide)
        self.root.after(0, lambda: self._update_output_text("Translation cancelled by user."))
        self.root.after(0, lambda: self._set_ui_state(is_translating=False))

    def _perform_translation_task(self, input_text, target_lang_name, selected_model_name, selected_prompt_file):
        try:
            self.root.after(0, lambda: self.loading_indicator.show("Translating...", cancel_command=self._cancel_translation))
            novel_references = self.references_text_area.get("1.0", tk.END).strip()
            
            if self.cancel_translation_event.is_set():
                return
            
            translated_text, recommendation_text = self.translation_service.translate_text(
                input_text, target_lang_name, selected_model_name, novel_references, self.cancel_translation_event, selected_prompt_file
            )
            
            if self.cancel_translation_event.is_set():
                return

            self.root.after(0, lambda: self._update_output_text(translated_text))
            
            if recommendation_text and recommendation_text != "No new reference found":
                self.root.after(0, lambda: self._show_recommendation_popup(recommendation_text))
            else:
                self.root.after(0, lambda: messagebox.showinfo("Translation Complete", "Translation finished!", parent=self.root))

        except RuntimeError as e:
            if not self.cancel_translation_event.is_set():
                self.root.after(0, lambda: self._update_output_text(str(e), is_error=True))
                self.root.after(0, lambda: messagebox.showerror("Translation Error", f"An error occurred during translation:\n{e}"))
        finally:
            self.root.after(0, lambda: self._set_ui_state(is_translating=False))
            self.root.after(0, self.loading_indicator.hide)

    def _set_ui_state(self, is_translating):
        self.translate_button.config(state=tk.DISABLED if is_translating else tk.NORMAL)
        self.save_output_button.config(state=tk.DISABLED if is_translating else tk.NORMAL)
        self.virtual_keyboard_button.config(state=tk.DISABLED if is_translating else tk.NORMAL)
        self.model_combobox.config(state=tk.DISABLED if is_translating else "readonly")
        self.output_language_combobox.config(state=tk.DISABLED if is_translating else "readonly")
        self.prompt_combobox.config(state=tk.DISABLED if is_translating else "readonly")

    def _on_novel_title_change(self, event=None):
        novel_title = self.novel_title_entry.get().strip()
        self.loading_indicator.show("Checking references...")
        threading.Thread(target=self._load_references_task, args=(novel_title,)).start()

    def _load_references_task(self, novel_title):
        references = self.reference_manager.load_references(novel_title)
        self.root.after(0, lambda: self.references_text_area.delete("1.0", tk.END))
        self.root.after(0, lambda: self.references_text_area.insert(tk.END, references))
        self.root.after(0, self.loading_indicator.hide)

    def _on_novel_title_select(self, event=None):
        selected_title = self.novel_title_dropdown.get()
        if selected_title:
            self.novel_title_entry.delete(0, tk.END)
            self.novel_title_entry.insert(0, selected_title)
            self._on_novel_title_change()

    def _update_novel_title_dropdown(self):
        saved_titles = self.reference_manager.get_saved_novel_titles()
        self.novel_title_dropdown['values'] = saved_titles

    def _start_model_loading_threaded(self):
        self.loading_indicator.show("Checking available models...")
        threading.Thread(target=self._populate_models_task).start()

    def _populate_models_task(self):
        try:
            available_gemini_models = self.translation_service.get_gemini_models()
            self.root.after(0, lambda: self._set_model_combobox(available_gemini_models))
        except RuntimeError as e:
            self.root.after(0, lambda: messagebox.showerror("API Error", str(e)))
            self.root.after(0, lambda: self._set_model_combobox([]))
        finally:
            self.root.after(0, self.loading_indicator.hide)

    def _set_model_combobox(self, available_gemini_models):
        if available_gemini_models:
            self.model_combobox['values'] = available_gemini_models
            selected_model = next((m for m in available_gemini_models if 'gemini-3.1-flash-lite-preview' in m),
                                  available_gemini_models[0])
            self.model_combobox.set(selected_model)
            self.model_combobox.config(state="readonly")
        else:
            self.model_combobox.set("No models found")
            self.model_combobox.config(state="disabled")

    def _populate_prompt_combobox(self):
        """Populate the prompt combobox with available prompt files."""
        prompt_files = []
        
        # List of known prompt files to look for
        known_prompts = [
            os.path.join("Prompt", "translation_prompt_1.txt"),
            os.path.join("Prompt", "translation_prompt_2.txt"),
            os.path.join("Prompt", "translation_prompt_3.txt"),
            os.path.join("Prompt", "translation_prompt_4.txt"),
            os.path.join("Prompt", "translation_prompt_5.txt"),
            os.path.join("Prompt", "translation_prompt_6.txt")
        ]
        
        # Check which prompt files exist
        for prompt_file in known_prompts:
            if os.path.exists(prompt_file):
                prompt_files.append(prompt_file)
        
        if prompt_files:
            self.prompt_combobox['values'] = prompt_files
            # Set the currently used prompt as default
            if prompt_file_path in prompt_files:
                self.prompt_combobox.set(prompt_file_path)
            else:
                self.prompt_combobox.set(prompt_files[0])
            self.prompt_combobox.config(state="readonly")
        else:
            self.prompt_combobox.set("No prompt files found")
            self.prompt_combobox.config(state="disabled")

if __name__ == "__main__":
    app_root = tk.Tk()
    app = NovelTranslatorApp(app_root)
    app_root.mainloop()