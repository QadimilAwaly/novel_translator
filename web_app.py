from flask import Flask, render_template, request, jsonify
import os
import threading
import webbrowser
import uuid
import time
from concurrent.futures import ThreadPoolExecutor

from config import AppConfig
from services.translation_service import TranslationService
from services.reference_service import ReferenceService
from services.export_service import ExportService

app = Flask(__name__, static_folder='static', template_folder='templates')

# Global configuration and service initialization (instantiated once)
config = AppConfig()
translation_svc = TranslationService(api_key=config.api_key, fallback_prompt_template=config.default_prompt)
reference_svc = ReferenceService(folder_name=config.REFERENCES_DIR)
export_svc = ExportService(base_dir=config.OUTPUT_DIR)

# Lock for job operations to guarantee thread safety
jobs_lock = threading.Lock()
# Persistent storage for async translation jobs
jobs = {}
# Thread pool executor to throttle concurrent translations and avoid thread leakage
executor = ThreadPoolExecutor(max_workers=4)

def create_services():
    return config, translation_svc, reference_svc, export_svc

@app.route('/')
def index():
    config, translation_svc, reference_svc, export_svc = create_services()
    titles = reference_svc.get_saved_novel_titles()
    prompts = [p for p in config.KNOWN_PROMPT_FILES if os.path.exists(os.path.join(config.PROMPT_DIR, p))]
    return render_template('index.html', titles=titles, prompts=prompts, languages=config.RELEVANT_LANGUAGES)


@app.route('/models')
def models():
    _, translation_svc, _, _ = create_services()
    try:
        models = translation_svc.get_gemini_models()
        return jsonify({'models': models})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/load_refs')
def load_refs():
    _, _, reference_svc, _ = create_services()
    title = request.args.get('title', '')
    try:
        refs = reference_svc.load_references(title) or ""
        return jsonify({'references': refs})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/save_refs', methods=['POST'])
def save_refs():
    _, _, reference_svc, _ = create_services()
    data = request.json or {}
    title = data.get('title', '').strip()
    refs = data.get('references', '')
    if not title:
        return jsonify({'error': 'Title required'}), 400
    try:
        reference_svc.save_references(title, refs)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/translate', methods=['POST'])
def translate():
    config, translation_svc, reference_svc, _ = create_services()
    data = request.json or {}
    input_text = data.get('input_text', '')
    title = data.get('title', '')
    target_lang = data.get('target_lang', '')
    model = data.get('model', '')
    refs = data.get('references', '')
    try:
        prompt_file = config.get_prompt_path(data.get('prompt_file', ''))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    if not input_text or not title:
        return jsonify({'error': 'Title and input_text are required'}), 400

    # Auto-save references
    try:
        reference_svc.save_references(title, refs)
    except Exception:
        pass

    # Filter references based on input text to minimize token usage
    filtered_refs = reference_svc.load_references(title, input_text)

    # synchronous fallback (keeps compatibility)
    cancel_flag = threading.Event()
    try:
        translated, recommendations = translation_svc.translate_text(input_text, target_lang, model, filtered_refs, cancel_flag, prompt_file)
        return jsonify({'translated': translated, 'recommendations': recommendations})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/translate_async', methods=['POST'])
def translate_async():
    config, translation_svc, reference_svc, _ = create_services()
    data = request.json or {}
    input_text = data.get('input_text', '')
    title = data.get('title', '')
    target_lang = data.get('target_lang', '')
    model = data.get('model', '')
    refs = data.get('references', '')
    try:
        prompt_file = config.get_prompt_path(data.get('prompt_file', ''))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    if not input_text or not title:
        return jsonify({'error': 'Title and input_text are required'}), 400

    # Auto-save references
    try:
        reference_svc.save_references(title, refs)
    except Exception:
        pass

    # Filter references based on input text to minimize token usage
    filtered_refs = reference_svc.load_references(title, input_text)

    job_id = str(uuid.uuid4())
    cancel_event = threading.Event()

    def worker():
        with jobs_lock:
            if job_id in jobs:
                jobs[job_id]['status'] = 'running'
        try:
            translated, recommendations = translation_svc.translate_text(input_text, target_lang, model, filtered_refs, cancel_event, prompt_file)
            with jobs_lock:
                if job_id in jobs:
                    if cancel_event.is_set():
                        jobs[job_id]['status'] = 'cancelled'
                        jobs[job_id]['result'] = {'translated': '', 'recommendations': 'Cancelled by user.'}
                    else:
                        jobs[job_id]['status'] = 'completed'
                        jobs[job_id]['result'] = {'translated': translated, 'recommendations': recommendations}
        except Exception as e:
            with jobs_lock:
                if job_id in jobs:
                    jobs[job_id]['status'] = 'error'
                    jobs[job_id]['error'] = str(e)

    now = time.time()
    with jobs_lock:
        # Prune expired or old jobs to avoid memory leaks
        expired_ids = [jid for jid, job in jobs.items() if now - job.get('created_at', 0) > 3600]
        for jid in expired_ids:
            if jobs[jid]['status'] in ('completed', 'cancelled', 'error'):
                del jobs[jid]
        
        # Keep list size under 100
        if len(jobs) > 100:
            sorted_jobs = sorted(jobs.items(), key=lambda item: item[1].get('created_at', 0))
            for jid, job in sorted_jobs:
                if len(jobs) <= 100:
                    break
                if job['status'] in ('completed', 'cancelled', 'error'):
                    del jobs[jid]

        jobs[job_id] = {
            'status': 'queued',
            'result': None,
            'error': None,
            'cancel_event': cancel_event,
            'created_at': now
        }

    executor.submit(worker)
    return jsonify({'job_id': job_id})


@app.route('/translate_status/<job_id>')
def translate_status(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            return jsonify({'error': 'Job not found'}), 404
        status = job['status']
    return jsonify({'status': status})


@app.route('/translate_result/<job_id>')
def translate_result(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            return jsonify({'error': 'Job not found'}), 404
        status = job['status']
        result = job.get('result', {})
        error = job.get('error', 'Unknown error')

    if status == 'completed':
        return jsonify(result)
    if status == 'cancelled':
        return jsonify(result)
    if status == 'error':
        return jsonify({'error': error}), 500
    return jsonify({'status': status}), 202


@app.route('/cancel_translation/<job_id>', methods=['POST'])
def cancel_translation(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            return jsonify({'error': 'Job not found'}), 404
        job['cancel_event'].set()
        job['status'] = 'cancelling'
    return jsonify({'ok': True})



@app.route('/titles')
def titles():
    _, _, reference_svc, _ = create_services()
    try:
        return jsonify({'titles': reference_svc.get_saved_novel_titles()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/latest_chapter')
def latest_chapter():
    _, _, _, export_svc = create_services()
    title = request.args.get('title', '').strip()
    if not title:
        return jsonify({'error': 'Title required'}), 400
    try:
        next_num = export_svc.get_next_chapter_number(title)
        return jsonify({'next_chapter': str(next_num)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/save_chapter', methods=['POST'])
def save_chapter():
    _, _, _, export_svc = create_services()
    data = request.json or {}
    title = data.get('title', '').strip()
    chapter = data.get('chapter', '').strip()
    content = data.get('content', '')
    overwrite = bool(data.get('overwrite', False))

    if not (title and chapter and content):
        return jsonify({'error': 'title, chapter, and content are required'}), 400

    try:
        file_path = export_svc.get_chapter_path(title, chapter)
        if os.path.exists(file_path) and not overwrite:
            return jsonify({
                'error': 'already_exists',
                'message': f'A chapter file already exists at {file_path}',
                'path': file_path
            }), 409

        path = export_svc.save_chapter(title, chapter, content)
        return jsonify({'path': path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def run_app(host='127.0.0.1', port=5000, open_browser=True):
    url = f'http://{host}:{port}/'
    if open_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    app.run(host=host, port=port, debug=False, threaded=True)


if __name__ == '__main__':
    run_app()
