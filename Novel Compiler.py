import tkinter as tk
from tkinter import filedialog, messagebox, Listbox, Scrollbar, ttk
import os
from ebooklib import epub
from bs4 import BeautifulSoup
import threading
import re
import locale
import codecs

# Helper function for natural sorting
def natural_sort_key(s):
    """
    Key function for natural sort order (alphanumeric).
    Splits the string into parts of numbers and non-numbers and converts numbers to int.
    """
    return [int(text) if text.isdigit() else text.lower()
            for text in re.split('([0-9]+)', s)]

class NovelCompilerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Novel Compiler & EPUB Creator")
        self.root.geometry("900x700")
        self.root.minsize(700, 500)

        self.files_to_merge = [] # Stores selected file paths
        self.buttons_to_manage = [] # Store button references for easy enable/disable

        # --- File Selection Frame ---
        file_frame = tk.LabelFrame(root, text="Select Novel Chapters (.txt)", padx=10, pady=10)
        file_frame.pack(pady=10, padx=10, fill="both", expand=True)
        
        # Initialize listbox_scroll_frame early
        listbox_scroll_frame = tk.Frame(file_frame)
        listbox_scroll_frame.pack(side=tk.LEFT, fill="both", expand=True)
        
        self.file_listbox = Listbox(listbox_scroll_frame, selectmode=tk.EXTENDED, height=15)
        self.file_listbox.grid(row=0, column=0, sticky="nsew") # Use grid for Listbox inside this frame

        # Vertical Scrollbar
        v_scrollbar = Scrollbar(listbox_scroll_frame, orient="vertical", command=self.file_listbox.yview)
        v_scrollbar.grid(row=0, column=1, sticky="ns") # To the right of Listbox
        self.file_listbox.config(yscrollcommand=v_scrollbar.set)

        # Horizontal Scrollbar
        h_scrollbar = Scrollbar(listbox_scroll_frame, orient="horizontal", command=self.file_listbox.xview)
        h_scrollbar.grid(row=1, column=0, sticky="ew") # Below Listbox
        self.file_listbox.config(xscrollcommand=h_scrollbar.set)

        # Configure grid for frame containing Listbox and Scrollbar
        listbox_scroll_frame.grid_rowconfigure(0, weight=1)
        listbox_scroll_frame.grid_columnconfigure(0, weight=1)

        btn_frame_listbox = tk.Frame(file_frame)
        btn_frame_listbox.pack(side=tk.RIGHT, padx=5) # This stays the same, to the right of the large frame


        self.btn_select_files = tk.Button(btn_frame_listbox, text="Add Files", command=self.select_files)
        self.btn_select_files.pack(pady=5, fill="x")
        self.buttons_to_manage.append(self.btn_select_files)

        self.btn_select_folder = tk.Button(btn_frame_listbox, text="Add Folder", command=self.select_folder)
        self.btn_select_folder.pack(pady=5, fill="x")
        self.buttons_to_manage.append(self.btn_select_folder)

        self.btn_remove_selected = tk.Button(btn_frame_listbox, text="Remove Selected", command=self.remove_selected_files)
        self.btn_remove_selected.pack(pady=5, fill="x")
        self.buttons_to_manage.append(self.btn_remove_selected)

        self.btn_clear_all = tk.Button(btn_frame_listbox, text="Clear All", command=self.clear_all_files)
        self.btn_clear_all.pack(pady=5, fill="x")
        self.buttons_to_manage.append(self.btn_clear_all)

        self.btn_move_up = tk.Button(btn_frame_listbox, text="Move Up", command=self.move_file_up)
        self.btn_move_up.pack(pady=5, fill="x")
        self.buttons_to_manage.append(self.btn_move_up)

        self.btn_move_down = tk.Button(btn_frame_listbox, text="Move Down", command=self.move_file_down)
        self.btn_move_down.pack(pady=5, fill="x")
        self.buttons_to_manage.append(self.btn_move_down)

        # Move to Top/Bottom Buttons
        self.btn_move_to_top = tk.Button(btn_frame_listbox, text="Move to Top", command=self.move_file_to_top)
        self.btn_move_to_top.pack(pady=5, fill="x")
        self.buttons_to_manage.append(self.btn_move_to_top)

        self.btn_move_to_bottom = tk.Button(btn_frame_listbox, text="Move to Bottom", command=self.move_file_to_bottom)
        self.btn_move_to_bottom.pack(pady=5, fill="x")
        self.buttons_to_manage.append(self.btn_move_to_bottom)

        # --- EPUB Options Frame ---
        epub_options_frame = tk.LabelFrame(root, text="EPUB Options", padx=10, pady=10)
        epub_options_frame.pack(pady=10, padx=10, fill="x")

        tk.Label(epub_options_frame, text="Novel Title:").grid(row=0, column=0, sticky="w", pady=2)
        self.title_entry = tk.Entry(epub_options_frame, width=50, fg='grey') # Set initial foreground to grey
        self.title_entry.grid(row=0, column=1, sticky="ew", pady=2)
        self.title_entry.insert(0, "Your Novel Title")
        # Bind events for placeholder behavior
        self.title_entry.bind("<FocusIn>", lambda event: self._on_focus_in(self.title_entry, "Your Novel Title"))
        self.title_entry.bind("<FocusOut>", lambda event: self._on_focus_out(self.title_entry, "Your Novel Title"))


        tk.Label(epub_options_frame, text="Author Name:").grid(row=1, column=0, sticky="w", pady=2)
        self.author_entry = tk.Entry(epub_options_frame, width=50, fg='grey') # Set initial foreground to grey
        self.author_entry.grid(row=1, column=1, sticky="ew", pady=2)
        self.author_entry.insert(0, "Your Author Name")
        # Bind events for placeholder behavior
        self.author_entry.bind("<FocusIn>", lambda event: self._on_focus_in(self.author_entry, "Your Author Name"))
        self.author_entry.bind("<FocusOut>", lambda event: self._on_focus_out(self.author_entry, "Your Author Name"))

        epub_options_frame.grid_columnconfigure(1, weight=1)

        # --- Cover Image Frame ---
        cover_frame = tk.LabelFrame(root, text="EPUB Cover Image (Optional)", padx=10, pady=10)
        cover_frame.pack(pady=10, padx=10, fill="x")

        self.cover_path = None # To store the path of the selected cover image

        self.cover_label = tk.Label(cover_frame, text="No cover image selected.")
        self.cover_label.pack(side=tk.LEFT, fill="x", expand=True)

        self.btn_select_cover = tk.Button(cover_frame, text="Select Cover", command=self.select_cover_image)
        self.btn_select_cover.pack(side=tk.RIGHT)
        self.buttons_to_manage.append(self.btn_select_cover)

        # --- Output Directory Fix ---
        # Instead of selecting manually, fix the output directory to a 'Compiled Novel' subfolder
        self.output_directory = os.path.join(os.getcwd(), "Compiled Novel")
        # Ensure the directory exists
        os.makedirs(self.output_directory, exist_ok=True) 

        # Display the fixed output directory (optional, but good for user info)
        self.output_dir_display_label = tk.Label(root, text=f"Output will be saved in: {self.output_directory}", bd=1, relief=tk.SUNKEN, anchor=tk.W)
        self.output_dir_display_label.pack(pady=5, padx=10, fill="x")

        # Progress Bar and Status
        self.progress = ttk.Progressbar(root, orient="horizontal", length=100, mode="determinate")
        self.progress.pack(side=tk.BOTTOM, fill=tk.X, padx=10, pady=(0, 5))
        
        self.status_label = tk.Label(root, text="Ready.", bd=1, relief=tk.SUNKEN, anchor=tk.W)
        self.status_label.pack(side=tk.BOTTOM, fill=tk.X, ipady=2)

        # --- Process Button ---
        self.btn_process = tk.Button(root, text="Compile & Create EPUB", command=self.start_process_thread, height=2)
        self.btn_process.pack(pady=20, padx=10, fill="x")

        # --- Help Button ---
        btn_help = tk.Button(root, text="Help / Keyboard Shortcuts", command=self.show_help)
        btn_help.pack(pady=5, padx=10)

        # --- Keyboard Shortcuts ---
        self.root.bind('<Control-o>', lambda e: self.select_files())
        self.root.bind('<Control-f>', lambda e: self.select_folder())
        self.root.bind('<Delete>', lambda e: self.remove_selected_files())
        self.root.bind('<Control-r>', lambda e: self.clear_all_files())
        self.root.bind('<Control-s>', lambda e: self.start_process_thread())
        self.root.bind('<Up>', lambda e: self.move_file_up())
        self.root.bind('<Down>', lambda e: self.move_file_down())
        self.root.bind('<Control-Shift-Up>', lambda e: self.move_file_to_top())
        self.root.bind('<Control-Shift-Down>', lambda e: self.move_file_to_bottom())
        self.root.bind('<F1>', lambda e: self.show_help())

    def _on_focus_in(self, entry_widget, placeholder_text):
        """Removes placeholder text and changes color when entry gains focus."""
        if entry_widget.get() == placeholder_text:
            entry_widget.delete(0, tk.END)
            entry_widget.config(fg='black')

    def _on_focus_out(self, entry_widget, placeholder_text):
        """Restores placeholder text and changes color if entry is empty when it loses focus."""
        if entry_widget.get() == "":
            entry_widget.insert(0, placeholder_text)
            entry_widget.config(fg='grey')

    def update_status(self, message):
        """Updates the status bar message."""
        self.status_label.config(text=message)
        self.root.update_idletasks() # Force update the GUI

    def update_progress(self, value):
        """Updates the progress bar."""
        self.progress['value'] = value
        self.root.update_idletasks()

    def select_files(self):
        """Opens a file dialog to select multiple .txt files and adds them to the list."""
        file_paths = filedialog.askopenfilenames(
            title="Select Novel Chapters",
            filetypes=[("Text files", "*.txt")]
        )
        self._add_and_sort_files(file_paths)
        if file_paths:
            self.update_status(f"{len(file_paths)} file(s) added.")

    def select_folder(self):
        """Opens a directory dialog to select a folder and adds all .txt files from it."""
        folder_path = filedialog.askdirectory(title="Select Folder Containing Novel Chapters")
        if folder_path:
            file_paths_in_folder = []
            for item in os.listdir(folder_path):
                full_path = os.path.join(folder_path, item)
                if os.path.isfile(full_path) and item.lower().endswith(".txt"):
                    file_paths_in_folder.append(full_path)
            
            self._add_and_sort_files(file_paths_in_folder)
            if file_paths_in_folder:
                self.update_status(f"{len(file_paths_in_folder)} .txt file(s) added from folder.")
            else:
                self.update_status("No .txt files found in the selected folder.")
        else:
            self.update_status("Folder selection cancelled.")

    def _suggest_novel_title(self, file_path):
        """
        Suggests a novel title based on the first added file's name.
        Assumes titles are in formats like "Novel Title_Chapter 01.txt" or "Novel-Title-01.txt".
        """
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        # Remove common chapter numbering patterns at the end
        # e.g., "_23", "-Ch-01", " Chapter 1"
        cleaned_name = re.sub(r'(_|\s|-)?(ch|chapter)?\s*\d+(\s*\(.*\))?$', '', base_name, flags=re.IGNORECASE).strip()
        
        # Replace underscores and hyphens with spaces
        title = cleaned_name.replace('_', ' ').replace('-', ' ')
        
        # Capitalize the first letter of each word (title case)
        title = title.title()
        
        # Remove any trailing periods or extra spaces
        title = title.rstrip('. ').strip()
        
        return title
        
    def _add_and_sort_files(self, new_file_paths):
        """Helper to add new files, sort, and update the listbox."""
        new_files_added = False
        
        # Check if the title entry is still showing placeholder or is empty
        current_title = self.title_entry.get()
        is_title_placeholder = (current_title == "Your Novel Title" or not current_title.strip())

        # If it's a placeholder and we have new files, try to suggest a title
        if is_title_placeholder and new_file_paths:
            suggested_title = self._suggest_novel_title(new_file_paths[0]) # Use the first file for suggestion
            if suggested_title and suggested_title != "Your Novel Title": # Avoid setting to empty or placeholder
                self.title_entry.delete(0, tk.END)
                self.title_entry.insert(0, suggested_title)
                self.title_entry.config(fg='black') # Change color to black if set automatically
                self.update_status(f"Suggested title: '{suggested_title}'")

        for fp in new_file_paths:
            if fp not in self.files_to_merge: # Avoid duplicates
                self.files_to_merge.append(fp)
                new_files_added = True
        
        if new_files_added:
            # Sort files using the natural_sort_key for correct numerical ordering
            self.files_to_merge.sort(key=lambda path: natural_sort_key(os.path.basename(path)))
            self.update_file_listbox()
         
    def remove_selected_files(self):
        """Removes selected files from the listbox and internal list."""
        selected_indices = self.file_listbox.curselection()
        if not selected_indices:
            self.update_status("No files selected to remove.")
            return

        for index in sorted(selected_indices, reverse=True):
            del self.files_to_merge[index]
        self.update_file_listbox()
        self.update_status(f"{len(selected_indices)} file(s) removed.")

    def clear_all_files(self):
        """Removes all files from the list."""
        if not self.files_to_merge:
            self.update_status("No files to clear.")
            return
        
        if messagebox.askyesno("Confirm Clear", "Are you sure you want to remove all files from the list?"):
            self.files_to_merge.clear()
            self.update_file_listbox()
            self.update_status("All files cleared.")

    def show_help(self):
        """Shows a help dialog with keyboard shortcuts."""
        help_text = """Keyboard Shortcuts:

Ctrl+O - Add Files
Ctrl+F - Add Folder
Delete - Remove Selected Files
Ctrl+R - Clear All Files
Ctrl+S - Compile & Create EPUB
Up Arrow - Move Selected File Up
Down Arrow - Move Selected File Down
Ctrl+Shift+Up - Move Selected File to Top
Ctrl+Shift+Down - Move Selected File to Bottom
F1 - Show this help dialog

Tips:
- Files are automatically sorted in natural order (1, 2, 10 instead of 1, 10, 2)
- The novel title is automatically suggested based on the first file name
- EPUB files are saved in the 'Compiled Novel' folder in the current directory
- Supported text file encodings: UTF-8, system default, Latin-1
"""
        messagebox.showinfo("Help - Keyboard Shortcuts", help_text)

    def move_file_up(self):
        """Moves the selected file up in the list."""
        selected_indices = self.file_listbox.curselection()
        if not selected_indices:
            return
        
        idx = selected_indices[0]
        if idx > 0:
            self.files_to_merge[idx], self.files_to_merge[idx-1] = \
                self.files_to_merge[idx-1], self.files_to_merge[idx]
            self.update_file_listbox()
            self.file_listbox.selection_clear(0, tk.END)
            self.file_listbox.selection_set(idx - 1)
            self.file_listbox.see(idx - 1)
            self.update_status(f"Moved '{os.path.basename(self.files_to_merge[idx-1])}' up.")

    def move_file_down(self):
        """Moves the selected file down in the list."""
        selected_indices = self.file_listbox.curselection()
        if not selected_indices:
            return

        idx = selected_indices[0]
        if idx < len(self.files_to_merge) - 1:
            self.files_to_merge[idx], self.files_to_merge[idx+1] = \
                self.files_to_merge[idx+1], self.files_to_merge[idx]
            self.update_file_listbox()
            self.file_listbox.selection_clear(0, tk.END)
            self.file_listbox.selection_set(idx + 1)
            self.file_listbox.see(idx + 1)
            self.update_status(f"Moved '{os.path.basename(self.files_to_merge[idx+1])}' down.")

    def move_file_to_top(self):
        """Moves the selected file to the very top of the list."""
        selected_indices = self.file_listbox.curselection()
        if not selected_indices:
            return

        idx = selected_indices[0]
        if idx > 0:
            file_to_move = self.files_to_merge.pop(idx) # Remove from current position
            self.files_to_merge.insert(0, file_to_move) # Insert at the beginning
            self.update_file_listbox()
            self.file_listbox.selection_clear(0, tk.END)
            self.file_listbox.selection_set(0) # Select the new top item
            self.file_listbox.see(0)
            self.update_status(f"Moved '{os.path.basename(file_to_move)}' to top.")

    def move_file_to_bottom(self):
        """Moves the selected file to the very bottom of the list."""
        selected_indices = self.file_listbox.curselection()
        if not selected_indices:
            return

        idx = selected_indices[0]
        if idx < len(self.files_to_merge) - 1:
            file_to_move = self.files_to_merge.pop(idx) # Remove from current position
            self.files_to_merge.append(file_to_move) # Append to the end
            self.update_file_listbox()
            self.file_listbox.selection_clear(0, tk.END)
            self.file_listbox.selection_set(len(self.files_to_merge) - 1) # Select the new bottom item
            self.file_listbox.see(len(self.files_to_merge) - 1)
            self.update_status(f"Moved '{os.path.basename(file_to_move)}' to bottom.")

    def update_file_listbox(self):
        """Refreshes the displayed list of files."""
        self.file_listbox.delete(0, tk.END)
        for i, file_path in enumerate(self.files_to_merge):
            self.file_listbox.insert(tk.END, f"{i+1}. {os.path.basename(file_path)}")

    def select_cover_image(self):
        """Opens a file dialog to select a JPG/PNG file for the EPUB cover."""
        file_path = filedialog.askopenfilename(
            title="Select Cover Image",
            filetypes=[("Image files", "*.jpg *.jpeg *.png")]
        )
        if file_path:
            self.cover_path = file_path
            self.cover_label.config(text=f"Cover Image: {os.path.basename(file_path)}")
            self.update_status(f"Cover image '{os.path.basename(file_path)}' selected.")
        else:
            self.cover_path = None
            self.cover_label.config(text="No cover image selected.")
            self.update_status("Cover image selection cancelled.")

    def start_process_thread(self):
        """Starts the main processing in a separate thread to keep the GUI responsive."""
        self.btn_process.config(state=tk.DISABLED)
        # Disable all file modification buttons during processing
        for btn in self.buttons_to_manage:
            btn.config(state=tk.DISABLED)
        
        self.update_status("Processing started...")
        self.update_progress(0)
        process_thread = threading.Thread(target=self._process_files_threaded)
        process_thread.start()

    def _process_files_threaded(self):
        """Wrapper for process_files to handle UI updates safely from the thread."""
        try:
            self.process_files()
        finally:
            # Use root.after to update UI from main thread
            self.root.after(100, lambda: self.btn_process.config(state=tk.NORMAL))
            self.root.after(100, self._enable_file_buttons)

    def _enable_file_buttons(self):
        """Helper to re-enable file modification buttons after processing."""
        for btn in self.buttons_to_manage:
            btn.config(state=tk.NORMAL)

    def process_files(self):
        """Combines TXT files, formats them into HTML paragraphs, and creates an EPUB."""
        if not self.files_to_merge:
            messagebox.showwarning("No Files Selected", "Please add at least one TXT file to compile.\n\nYou can add files using the 'Add Files' or 'Add Folder' buttons.")
            self.update_status("Processing failed: No files selected.")
            # Ensure buttons are re-enabled if processing fails early
            self.root.after(100, lambda: self.btn_process.config(state=tk.NORMAL))
            self.root.after(100, self._enable_file_buttons)
            return

        novel_title = self.title_entry.get().strip()
        author_name = self.author_entry.get().strip()

        # Check if the title or author is still the placeholder text
        if novel_title == "Your Novel Title" or not novel_title:
            messagebox.showwarning("Missing Title", "Please enter a novel title in the 'EPUB Options' section.\n\nThe title is required for the EPUB file.")
            self.update_status("Processing failed: Invalid novel title.")
            self.root.after(100, lambda: self.btn_process.config(state=tk.NORMAL))
            self.root.after(100, self._enable_file_buttons)
            return
        if author_name == "Your Author Name" or not author_name:
            messagebox.showwarning("Missing Author", "Please enter an author name in the 'EPUB Options' section.\n\nThe author name is required for the EPUB file.")
            self.update_status("Processing failed: Invalid author name.")
            self.root.after(100, lambda: self.btn_process.config(state=tk.NORMAL))
            self.root.after(100, self._enable_file_buttons)
            return

        self.update_status("1/3: Reading and processing chapters...")
        
        book = epub.EpubBook()
        book.set_identifier(f"id{hash(novel_title + author_name)}")
        book.set_title(novel_title)
        book.set_language('en') 
        book.add_author(author_name)

        # Add nav and ncx items first
        nav_doc = epub.EpubNav()
        book.add_item(nav_doc)
        
        ncx_doc = epub.EpubNcx()
        book.add_item(ncx_doc)

        if self.cover_path:
            try:
                self.update_status("Adding cover image...")
                with open(self.cover_path, 'rb') as f:
                    cover_image_data = f.read()

                _, ext = os.path.splitext(self.cover_path)
                if ext.lower() in ['.jpg', '.jpeg']:
                    media_type = 'image/jpeg'
                elif ext.lower() == '.png':
                    media_type = 'image/png'
                else:
                    messagebox.showwarning("Cover Image Type", "Unsupported cover image format. Only JPG/PNG are recommended for EPUB.")
                    media_type = 'application/octet-stream'
                
                cover_item = epub.EpubItem(uid="cover_image", file_name=f'images/{os.path.basename(self.cover_path)}', media_type=media_type, content=cover_image_data)
                book.add_item(cover_item)
                book.set_cover(cover_item.file_name, cover_image_data) 

            except Exception as e:
                messagebox.showwarning("Cover Image Warning", f"Could not add cover image: {e}\n\nThe EPUB will be created without a cover image.")
                self.update_status("Warning: Cover image could not be added.")

        epub_chapters = [] 
        epub_toc_links = []
        used_filenames = set() # Track used filenames to prevent duplicates 

        for i, file_path in enumerate(self.files_to_merge):
            try:
                self.update_status(f"1/3: Processing chapter {i+1}/{len(self.files_to_merge)}: {os.path.basename(file_path)}")
                self.update_progress((i / len(self.files_to_merge)) * 33)
                
                # Try to read file with UTF-8, fallback to system encoding if it fails
                content = None
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                except UnicodeDecodeError:
                    try:
                        with open(file_path, 'r', encoding=locale.getpreferredencoding()) as f:
                            content = f.read()
                    except UnicodeDecodeError:
                        try:
                            with open(file_path, 'r', encoding='latin-1') as f:
                                content = f.read()
                        except Exception as e:
                            raise Exception(f"Could not read file with any encoding: {e}")
                
                if content is None:
                    raise Exception("Failed to read file content")
                
                chapter_base_name = os.path.splitext(os.path.basename(file_path))[0]
                
                safe_chapter_file_name = re.sub(r'[^\w\s-]', '', chapter_base_name).strip()
                safe_chapter_file_name = re.sub(r'[-\s]+', '_', safe_chapter_file_name)
                
                # Ensure unique filename by adding counter if duplicate
                base_filename = safe_chapter_file_name
                counter = 1
                while safe_chapter_file_name in used_filenames:
                    safe_chapter_file_name = f"{base_filename}_{counter}"
                    counter += 1
                used_filenames.add(safe_chapter_file_name)
                
                chapter_raw_content = content
                
                # Check if content is empty
                if not chapter_raw_content.strip():
                    print(f"Warning: File {os.path.basename(file_path)} is empty. Skipping.")
                    continue
                
                # Replace multiple newlines (paragraph breaks) with a placeholder
                formatted_content = re.sub(r'\r?\n\s*\r?\n', 'PARAGRAPH_BREAK', chapter_raw_content)
                
                # Replace single newlines with a <br/> tag (line break within a paragraph)
                formatted_content = formatted_content.replace("\r\n", "<br/>")
                formatted_content = formatted_content.replace("\n", "<br/>")
                
                # Now replace the placeholder with </p><p> to create new paragraphs
                formatted_content = formatted_content.replace("PARAGRAPH_BREAK", "</p><p>")
                
                # Ensure the entire content is wrapped in paragraph tags
                formatted_content = formatted_content.strip()
                if not formatted_content.startswith('<p>'):
                    formatted_content = f"<p>{formatted_content}"
                if not formatted_content.endswith('</p>'):
                    formatted_content = f"{formatted_content}</p>"
                chapter_html_content = formatted_content
                
                # Add chapter title as H1 at the beginning of the chapter content
                final_chapter_content = f"<h1>{chapter_base_name}</h1>\n{chapter_html_content}"

                soup = BeautifulSoup(final_chapter_content, 'html.parser')
                chapter_content_for_epub = str(soup) 

                c = epub.EpubHtml(title=chapter_base_name, file_name=f'chap_{safe_chapter_file_name}_{i+1}.xhtml', lang='en')
                c.content = chapter_content_for_epub
                book.add_item(c) 
                epub_chapters.append(c) 
                epub_toc_links.append(epub.Link(c.file_name, chapter_base_name, c.file_name.replace('.xhtml', ''))) 
                    

            except Exception as e:
                messagebox.showerror("File Read Error", f"Failed to process file:\n{os.path.basename(file_path)}\n\nError: {e}\n\nPlease check if the file is a valid text file and try again.")
                self.update_status("Processing failed: File read error.")
                # Ensure buttons are re-enabled even on error during processing
                self.root.after(100, lambda: self.btn_process.config(state=tk.NORMAL))
                self.root.after(100, self._enable_file_buttons)
                return
        

        if not epub_chapters:
            messagebox.showerror("Processing Error", "No chapters were successfully processed.\n\nThe EPUB would be empty. Please check your text files and try again.")
            self.update_status("Processing failed: No chapters processed.")
            self.root.after(100, lambda: self.btn_process.config(state=tk.NORMAL))
            self.root.after(100, self._enable_file_buttons)
            return

        self.update_status("2/3: Building EPUB structure and table of contents...")
        self.update_progress(66)

        book.toc = tuple(epub_toc_links)
        book.spine = ['nav'] + [c.file_name for c in epub_chapters]

        safe_novel_title = re.sub(r'[^\w\s-]', '', novel_title).strip()
        safe_novel_title = re.sub(r'[-\s]+', '_', safe_novel_title)
        
        output_epub_filename = f"{safe_novel_title}.epub"
        output_path = os.path.join(self.output_directory, output_epub_filename)

        self.update_status(f"3/3: Writing EPUB file to {output_path}...")
        self.update_progress(90)
        try:
            epub.write_epub(output_path, book, {}) 
            messagebox.showinfo("Success!", f"Novel successfully compiled and saved as EPUB at:\n{output_path}")
            self.status_label.config(text="Processing complete: EPUB created successfully!")
            self.update_progress(100) 
        except Exception as e:
            messagebox.showerror("EPUB Creation Error", f"Failed to create EPUB file:\n{e}\n\nPlease check if you have write permissions to the output directory:\n{self.output_directory}")
            self.status_label.config(text="Processing failed: EPUB creation error.") 


# --- Main Application Part ---
if __name__ == "__main__":
    root = tk.Tk()
    app = NovelCompilerApp(root)
    root.mainloop()