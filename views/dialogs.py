# views/dialogs.py
import tkinter as tk
from tkinter import ttk, scrolledtext

class LoadingIndicator:
    def __init__(self, parent):
        self.parent = parent
        self.window = None
        self.label = None
        self.cancel_button = None

    def show(self, message="Loading...", cancel_command=None):
        if self.window is None or not self.window.winfo_exists():
            self.window = tk.Toplevel(self.parent)
            self.window.title("Please Wait")
            self.window.transient(self.parent)
            self.window.grab_set()
            self._center_window(300, 150)
            self.window.resizable(False, False)
            
            self.label = ttk.Label(self.window, text=message, font=("Arial", 11))
            self.label.pack(expand=True, pady=(10, 5))

            if cancel_command:
                self.cancel_button = ttk.Button(self.window, text="Cancel", command=cancel_command)
                self.cancel_button.pack(pady=(5, 10))
            self.window.protocol("WM_DELETE_WINDOW", lambda: None)
        else:
            self.label.config(text=message)
            if self.cancel_button and cancel_command:
                self.cancel_button.config(command=cancel_command)
        self.parent.update_idletasks()

    def hide(self):
        if self.window and self.window.winfo_exists():
            self.window.destroy()
            self.window = None

    def _center_window(self, width, height):
        self.parent.update_idletasks()
        rx, ry = self.parent.winfo_x(), self.parent.winfo_y()
        rw, rh = self.parent.winfo_width(), self.parent.winfo_height()
        x = rx + (rw // 2) - (width // 2)
        y = ry + (rh // 2) - (height // 2)
        self.window.geometry(f"{width}x{height}+{x}+{y}")


class ChapterInputDialog(tk.Toplevel):
    def __init__(self, parent):
        super().__init__(parent)
        self.title("Chapter Number")
        self.geometry("300x150")
        self.transient(parent)
        self.resizable(False, False)
        self.result = None

        ttk.Label(self, text="Enter Chapter Number:").pack(pady=(15, 5))
        self.entry = ttk.Entry(self, width=20)
        self.entry.pack(pady=5)
        self.entry.focus_set()
        self.entry.bind("<Return>", lambda e: self._on_ok())

        btn_frame = ttk.Frame(self)
        btn_frame.pack(pady=10)
        ttk.Button(btn_frame, text="OK", command=self._on_ok).pack(side=tk.LEFT, padx=5)
        ttk.Button(btn_frame, text="Cancel", command=self._on_cancel).pack(side=tk.LEFT, padx=5)

        self._center(parent)

    def _center(self, parent):
        parent.update_idletasks()
        rx, ry, rw, rh = parent.winfo_x(), parent.winfo_y(), parent.winfo_width(), parent.winfo_height()
        x = rx + (rw // 2) - (300 // 2)
        y = ry + (rh // 2) - (150 // 2)
        self.geometry(f"+{x}+{y}")

    def _on_ok(self):
        self.result = self.entry.get().strip()
        self.destroy()

    def _on_cancel(self):
        self.result = None
        self.destroy()

    def show(self):
        self.wait_window(self)
        return self.result