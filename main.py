# main.py
import sys
import argparse

from config import AppConfig
from web_app import run_app
from services.translation_service import TranslationService
from services.reference_service import ReferenceService
from services.export_service import ExportService
from views.main_view import MainView
from controllers.main_controller import MainController
import tkinter as tk

def run_gui():
    root = tk.Tk()
    root.title("Novel Translator")
    config = AppConfig()
    translation_svc = TranslationService(config.api_key, config.default_prompt)
    reference_svc = ReferenceService(config.REFERENCES_DIR)
    export_svc = ExportService(config.OUTPUT_DIR)
    view = MainView(root, config.RELEVANT_LANGUAGES)
    controller = MainController(root, config, translation_svc, reference_svc, export_svc, view)
    root.mainloop()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--web', action='store_true', help='Run the web UI (localhost)')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', default=5000, type=int)
    args = parser.parse_args()

    if args.web:
        run_app(host=args.host, port=args.port)
    else:
        run_gui()

if __name__ == "__main__":
    main()