# views/keyboard_view.py
import tkinter as tk
from tkinter import ttk

class VirtualKeyboard(tk.Toplevel):
    def __init__(self, parent, on_key_press_callback):
        super().__init__(parent)
        self.title("Virtual Keyboard")
        self.transient(parent)
        self.on_key_press = on_key_press_callback
        self.caps_lock_on = False

        self.style = ttk.Style()
        self.style.configure("Caps.TButton", background="#6fa8dc", font=("Arial", 9, "bold"))

        keys_rows = [
            ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
            ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
            [':', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '-'],
            [',', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '.']
        ]

        self.key_buttons = []
        for row in keys_rows:
            frame = ttk.Frame(self)
            frame.pack(pady=2)
            for key in row:
                btn = ttk.Button(frame, text=key, width=3, command=lambda k=key: self._press(k))
                btn.pack(side=tk.LEFT, padx=1)
                self.key_buttons.append(btn)

        special_frame = ttk.Frame(self)
        special_frame.pack(pady=2)
        self.caps_btn = ttk.Button(special_frame, text="Caps", width=5, command=self._toggle_caps)
        self.caps_btn.pack(side=tk.LEFT, padx=1)
        ttk.Button(special_frame, text="Space", width=10, command=lambda: self._press(' ')).pack(side=tk.LEFT, padx=1)
        ttk.Button(special_frame, text="Bksp", width=5, command=lambda: self._press('Bksp')).pack(side=tk.LEFT, padx=1)
        ttk.Button(special_frame, text="Enter", width=5, command=lambda: self._press('Enter')).pack(side=tk.LEFT, padx=1)

    def _toggle_caps(self):
        self.caps_lock_on = not self.caps_lock_on
        for btn in self.key_buttons:
            char = btn.cget("text")
            if char.isalpha():
                btn.config(text=char.upper() if self.caps_lock_on else char.lower())
        self.caps_btn.config(style="Caps.TButton" if self.caps_lock_on else "TButton")

    def _press(self, key):
        if self.caps_lock_on and len(key) == 1 and key.isalpha():
            self.on_key_press(key.upper())
        else:
            self.on_key_press(key)