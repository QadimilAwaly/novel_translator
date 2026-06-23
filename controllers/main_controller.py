# controllers/main_controller.py
import tkinter as tk
from tkinter import messagebox, scrolledtext, ttk
import threading
import os

from views.dialogs import LoadingIndicator, ChapterInputDialog
from views.keyboard_view import VirtualKeyboard

class MainController:
    def __init__(self, root, config, translation_service, reference_service, export_service, view):
        self.root = root
        self.config = config
        self.translation_service = translation_service
        self.reference_service = reference_service
        self.export_service = export_service
        self.view = view

        self.loading_indicator = LoadingIndicator(self.root)
        self.active_text_widget = self.view.input_area
        self.keyboard_window = None

        self.cancel_event = threading.Event()
        self.thread = None
        self.prompt_file_map = {}

        self._bind_events()
        self._init_data()

    def _bind_events(self):
        # UI Button Bindings
        self.view.translate_btn.config(command=self._start_translation)
        self.view.save_btn.config(command=self._save_chapter)
        self.view.keyboard_btn.config(command=self._show_keyboard)

        # Widget Active Focus Bindings
        for widget in [self.view.title_entry, self.view.ref_text, self.view.input_area, self.view.output_area]:
            widget.bind("<FocusIn>", self._set_active_widget)
            widget.bind("<Button-1>", self._set_active_widget)

        # Title inputs changes
        self.view.title_entry.bind("<FocusOut>", self._on_title_change)
        self.view.title_entry.bind("<Return>", self._on_title_change)
        self.view.title_dropdown.bind("<<ComboboxSelected>>", self._on_dropdown_select)
        self.view.ref_text.bind("<FocusOut>", self._on_ref_change)

    def _init_data(self):
        self._refresh_saved_titles()
        # Fetching models in a thread so application doesn't freeze on start
        self.loading_indicator.show("Checking available models...")
        threading.Thread(target=self._load_models, daemon=True).start()
        self._load_prompts()

    def _set_active_widget(self, event):
        self.active_text_widget = event.widget

    def _load_models(self):
        try:
            models = self.translation_service.get_gemini_models()
            self.root.after(0, lambda: self._setup_models_combobox(models))
        except Exception as e:
            self.root.after(0, lambda: messagebox.showerror("API Error", str(e)))
        finally:
            self.root.after(0, self.loading_indicator.hide)

    def _setup_models_combobox(self, models):
        if models:
            self.view.model_combo['values'] = models
            self.view.model_combo.set(models[0])
        else:
            self.view.model_combo.set("No models found")

    def _load_prompts(self):
        known_prompts = [
            "translation_prompt_1.txt",
            "translation_prompt_2.txt",
            "translation_prompt_3.txt",
            "translation_prompt_4.txt",
            "translation_prompt_5.txt",
            "translation_prompt_6.txt"
        ]
        prompt_dir = getattr(self.config, 'PROMPT_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Prompt'))
        found_paths = []
        for prompt_name in known_prompts:
            path = os.path.join(prompt_dir, prompt_name)
            if os.path.exists(path):
                found_paths.append(path)

        if found_paths:
            self.prompt_file_map = {os.path.basename(path): path for path in found_paths}
            prompt_names = list(self.prompt_file_map.keys())
            self.view.prompt_combo['values'] = prompt_names
            self.view.prompt_combo.set(prompt_names[0])
        else:
            self.view.prompt_combo['values'] = []
            self.view.prompt_combo.set("No prompt files found")

    def _refresh_saved_titles(self):
        titles = self.reference_service.get_saved_novel_titles()
        self.view.title_dropdown['values'] = titles

    def _on_title_change(self, event=None):
        title = self.view.title_entry.get().strip()
        if title:
            try:
                refs = self.reference_service.load_references(title)
                self.view.ref_text.delete("1.0", tk.END)
                self.view.ref_text.insert(tk.END, refs)
            except Exception as e:
                messagebox.showerror("Error", str(e))

    def _on_dropdown_select(self, event=None):
        selected = self.view.title_dropdown.get()
        if selected:
            self.view.title_entry.delete(0, tk.END)
            self.view.title_entry.insert(0, selected)
            self._on_title_change()

    def _on_ref_change(self, event=None):
        title = self.view.title_entry.get().strip()
        refs = self.view.ref_text.get("1.0", tk.END).strip()
        if title:
            self.reference_service.save_references(title, refs)
            self._refresh_saved_titles()

    def _start_translation(self):
        if self.thread and self.thread.is_alive():
            return

        input_text = self.view.input_area.get("1.0", tk.END).strip()
        title = self.view.title_entry.get().strip()

        if not input_text or not title:
            messagebox.showwarning("Warning", "Title and Input Text are required.")
            return

        self.cancel_event.clear()
        self._set_ui_state(is_translating=True)
        self.loading_indicator.show("Translating...", cancel_command=self._cancel_translation)

        # Auto-save references before translating
        self.reference_service.save_references(title, self.view.ref_text.get("1.0", tk.END).strip())

        selected_prompt_name = self.view.prompt_combo.get()
        selected_prompt_path = self.prompt_file_map.get(selected_prompt_name, selected_prompt_name)

        self.thread = threading.Thread(
            target=self._run_translation_task,
            args=(
                input_text,
                self.view.lang_combo.get(),
                self.view.model_combo.get(),
                self.view.ref_text.get("1.0", tk.END).strip(),
                selected_prompt_path
            ),
            daemon=True
        )
        self.thread.start()

    def _cancel_translation(self):
        self.cancel_event.set()
        self.loading_indicator.show("Cancelling translation...")

    def _run_translation_task(self, input_text, target_lang, model, refs, prompt_file):
        try:
            # Filter references based on input text to minimize token usage
            title = self.view.title_entry.get().strip()
            filtered_refs = self.reference_service.load_references(title, input_text)
            
            trans, recommendations = self.translation_service.translate_text(
                input_text, target_lang, model, filtered_refs, self.cancel_event, prompt_file
            )
            if not self.cancel_event.is_set():
                self.root.after(0, lambda: self._on_translation_success(trans, recommendations))
        except Exception as e:
            if not self.cancel_event.is_set():
                self.root.after(0, lambda: messagebox.showerror("Translation Error", str(e)))
        finally:
            self.root.after(0, self.loading_indicator.hide)
            self.root.after(0, lambda: self._set_ui_state(is_translating=False))

    def _on_translation_success(self, translated_text, recommendations):
        self.view.output_area.delete("1.0", tk.END)
        self.view.output_area.insert(tk.END, translated_text)
        if recommendations and recommendations.strip():
            messagebox.showinfo("Recommendations Available", "AI recommended reference changes to review.")

    def _save_chapter(self):
        translated_text = self.view.output_area.get("1.0", tk.END).strip()
        title = self.view.title_entry.get().strip()

        if not translated_text or not title:
            messagebox.showwarning("Warning", "No content or Title to save.")
            return

        diag = ChapterInputDialog(self.root)
        chapter = diag.show()
        if not chapter:
            return

        try:
            file_path = self.export_service.get_chapter_path(title, chapter)
            if os.path.exists(file_path):
                if not messagebox.askyesno(
                    "Confirm Overwrite",
                    f"A chapter file already exists at:\n{file_path}\n\nDo you want to overwrite it?"
                ):
                    return

            path = self.export_service.save_chapter(title, chapter, translated_text)
            messagebox.showinfo("Saved Successfully", f"Chapter saved to: {path}")
        except Exception as e:
            messagebox.showerror("Export Failed", str(e))

    def _show_keyboard(self):
        if self.keyboard_window and self.keyboard_window.winfo_exists():
            self.keyboard_window.lift()
            return
        self.keyboard_window = VirtualKeyboard(self.root, self._on_keyboard_key)

    def _on_keyboard_key(self, key):
        widget = self.active_text_widget
        if not widget or not widget.winfo_exists():
            return

        if key == 'Bksp':
            try:
                # Handle selected text delete
                widget.delete(tk.SEL_FIRST, tk.SEL_LAST)
            except tk.TclError:
                if isinstance(widget, scrolledtext.ScrolledText):
                    widget.delete(f"{widget.index(tk.INSERT)}-1c", tk.INSERT)
                elif isinstance(widget, ttk.Entry):
                    idx = widget.index(tk.INSERT)
                    if idx > 0:
                        widget.delete(idx - 1, idx)
        elif key == 'Enter':
            if isinstance(widget, scrolledtext.ScrolledText):
                widget.insert(tk.INSERT, "\n")
        else:
            widget.insert(tk.INSERT, key)
            if hasattr(widget, "see"):
                widget.see(tk.INSERT)

    def _set_ui_state(self, is_translating):
        state = tk.DISABLED if is_translating else tk.NORMAL
        self.view.translate_btn.config(state=state)
        self.view.save_btn.config(state=state)
        self.view.keyboard_btn.config(state=state)