# views/main_view.py
import tkinter as tk
from tkinter import ttk, scrolledtext

class MainView(ttk.Frame):
    def __init__(self, parent, languages):
        super().__init__(parent)
        self.parent = parent
        self.languages = languages
        self.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        self._build_ui()

    def _build_ui(self):
        self.paned_window = ttk.PanedWindow(self, orient=tk.VERTICAL)
        self.paned_window.pack(fill=tk.BOTH, expand=True)

        # Top Section: Inputs & Controls
        self.top_frame = ttk.Frame(self.paned_window, padding="10")
        self.paned_window.add(self.top_frame)

        # 1. Novel Title Block (Label above Entry to allow full-width space)
        ttk.Label(self.top_frame, text="Novel Title:").pack(anchor=tk.W, pady=(0, 2))
        self.title_entry = ttk.Entry(self.top_frame)
        self.title_entry.pack(fill=tk.X, pady=(0, 10))

        # 2. Saved Novel Block (Label beside Combobox)
        saved_frame = ttk.Frame(self.top_frame)
        saved_frame.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(saved_frame, text="Saved Novel:", width=15).pack(side=tk.LEFT)
        self.title_dropdown = ttk.Combobox(saved_frame, state="readonly")
        self.title_dropdown.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # 3. Translate to Block (Label beside Combobox)
        lang_frame = ttk.Frame(self.top_frame)
        lang_frame.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(lang_frame, text="Translate to:", width=15).pack(side=tk.LEFT)
        self.lang_combo = ttk.Combobox(lang_frame, values=list(self.languages.keys()), state="readonly")
        self.lang_combo.set("English")
        self.lang_combo.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # 4. Model Block (Label beside Combobox)
        model_frame = ttk.Frame(self.top_frame)
        model_frame.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(model_frame, text="Model:", width=15).pack(side=tk.LEFT)
        self.model_combo = ttk.Combobox(model_frame, state="readonly")
        self.model_combo.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # 5. Prompt Block (Label beside Combobox)
        prompt_frame = ttk.Frame(self.top_frame)
        prompt_frame.pack(fill=tk.X, pady=(0, 10))
        ttk.Label(prompt_frame, text="Prompt:", width=15).pack(side=tk.LEFT)
        self.prompt_combo = ttk.Combobox(prompt_frame, state="readonly")
        self.prompt_combo.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # 6. References Block
        ttk.Label(self.top_frame, text="Novel References:").pack(anchor=tk.W, pady=(0, 2))
        self.ref_text = scrolledtext.ScrolledText(self.top_frame, height=5, wrap=tk.WORD, font=("Arial", 9))
        self.ref_text.pack(fill=tk.BOTH, expand=True, pady=(0, 10))

        # Buttons Control Row
        btn_row = ttk.Frame(self.top_frame)
        btn_row.pack(fill=tk.X, pady=(5, 0))
        self.translate_btn = ttk.Button(btn_row, text="Translate")
        self.translate_btn.pack(side=tk.LEFT, padx=(0, 5))
        self.save_btn = ttk.Button(btn_row, text="Save Chapter")
        self.save_btn.pack(side=tk.LEFT, padx=(0, 5))
        self.keyboard_btn = ttk.Button(btn_row, text="Virtual Keyboard")
        self.keyboard_btn.pack(side=tk.LEFT)

        # Bottom Section: Editor Text Panes
        self.text_paned = ttk.PanedWindow(self.paned_window, orient=tk.HORIZONTAL)
        self.paned_window.add(self.text_paned, weight=1)

        # Input Text Block
        input_container = ttk.Frame(self.text_paned)
        self.text_paned.add(input_container, weight=1)
        ttk.Label(input_container, text="Input Text:").pack(anchor=tk.W, pady=(0, 2))
        self.input_area = scrolledtext.ScrolledText(input_container, wrap=tk.WORD, font=("Arial", 10))
        self.input_area.pack(fill=tk.BOTH, expand=True, pady=(0, 5))

        # Translated Text Block
        output_container = ttk.Frame(self.text_paned)
        self.text_paned.add(output_container, weight=1)
        ttk.Label(output_container, text="Translated Text:").pack(anchor=tk.W, pady=(0, 2))
        self.output_area = scrolledtext.ScrolledText(output_container, wrap=tk.WORD, font=("Arial", 10))
        self.output_area.pack(fill=tk.BOTH, expand=True, pady=(0, 5))