import os
import json
import shutil
import time
from datetime import timedelta
from glob import glob
from flask import (
    Flask, render_template, request,
    redirect, url_for, jsonify,
    send_file, flash, abort
)
from flask_socketio import SocketIO, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'C9CFBDDD5AFCBB36C54CC8ACE63AC'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=2)
app.config['SESSION_COOKIE_SECURE'] = True
# Paths & JSON‐store setup
# ──────────────────────────────────────────────────
BASE_DIR      = os.path.dirname(__file__)
DATA_DIR      = os.path.join(BASE_DIR, 'data')
GUESTS_FILE   = os.path.join(DATA_DIR, 'guests.json')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')
COURSES_FILE  = os.path.join(DATA_DIR, 'courses.json')
RATINGS_FILE  = os.path.join(DATA_DIR, 'ratings.json')
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

# ─────────────────────────────────────────────────────────────
# 1) SOCKET EVENT HANDLERS (step 1)
# ─────────────────────────────────────────────────────────────
@socketio.on('admin_rate_course')
def _on_admin_rate_course(data):
    print("🔥 admin_rate_course got", data)
    # send to all connected clients by default (no broadcast arg)
    socketio.emit('rate_course', {'course_id': data['course_id']})

@socketio.on('admin_stop_rating')
def _on_admin_stop_rating():
    socketio.emit('stop_rating')

# ensure data dirs exist
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Initialize empty JSON stores if they don’t exist
for path, default in (
  (GUESTS_FILE,   {}),
  (SETTINGS_FILE, {"menu_available": False, "drink_options": []}),
  (COURSES_FILE,  []),
  (RATINGS_FILE,  [])
):
    if not os.path.exists(path):
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(default, f, indent=2)


# ──────────────────────────────────────────────────
# Generic JSON I/O helpers
# ──────────────────────────────────────────────────
def load_json(path, default):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default

def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
def load_guests():   return load_json(GUESTS_FILE, {})
def save_guests(d):  save_json(GUESTS_FILE, d)
def load_settings():   return load_json(SETTINGS_FILE, {"menu_available": False, "drink_options": []})
def save_settings(d):  save_json(SETTINGS_FILE, d)
def load_courses():   return load_json(COURSES_FILE, [])
def save_courses(d):  save_json(COURSES_FILE, d)
def load_ratings():   return load_json(RATINGS_FILE, [])
def save_ratings(d):  save_json(RATINGS_FILE, d)
def save_survey_state(name, step_data):
    """Save survey progress for a guest with validation and caching.
    
    Args:
        name (str): Guest name
        step_data (dict): Data for the current step
    """
    # Input validation
    if not name or not isinstance(step_data, dict):
        raise ValueError("Invalid input parameters")
        
    guests = load_guests()
    if name not in guests:
        guests[name] = {
            "first_time": None,
            "allergies": [],
            "avoid": None,
            "diet": None,
            "will_drink": None,
            "experience": [],
            "intensity": None,
            "likes": None,
            "notes": None,
            "seating": None,
            "assigned_drink": None,
            "current_step": 1,
            "last_active": time.time(),
            "completion_status": {},
            "validation_errors": []
        }
    
    # Update completion status
    if step_data.get('step_completed'):
        guests[name]['completion_status'][str(step_data['current_step'])] = True
        
    # Update last active timestamp
    guests[name]['last_active'] = time.time()
    
    guests[name].update(step_data)
    save_guests(guests)
    return guests[name]


# ─────────────────────────────────────────────────────────────
# 1) RSVP
# ─────────────────────────────────────────────────────────────
@app.route('/rsvp', methods=['GET', 'POST'])
def rsvp():
    guests     = load_guests()
    seats_left = max(0, 3 - len(guests))

    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        if not name:
            return render_template('rsvp.html',
                                   seats=seats_left,
                                   error="Enter your name.",
                                   hide_nav=True)
        if seats_left == 0 and name not in guests:
            return render_template('rsvp.html',
                                   seats=0,
                                   error="All seats taken.",
                                   hide_nav=True)
        guests.setdefault(name, {
            "first_time": None,
            "allergies": [],
            "avoid": None,
            "diet": None,
            "will_drink": None,
            "experience": [],
            "intensity": None,
            "likes": None,
            "notes": None,
            "seating": None,
            "assigned_drink": None
        })
        save_guests(guests)
        return redirect(url_for('survey', name=name))

    return render_template('rsvp.html',
                           seats=seats_left,
                           hide_nav=True)


# ─────────────────────────────────────────────────────────────
# 2) Guest API
# ─────────────────────────────────────────────────────────────
@app.route('/api/guest/<name>', methods=['GET', 'PATCH'])
def guest_api(name):
    # Input validation
    if not name or len(name) > 100:
        return jsonify({"error": "invalid guest name"}), 400

    # Cache guest data
    from functools import lru_cache

    @lru_cache(maxsize=32)
    def get_cached_guest(guest_name):
        return load_guests().get(guest_name)

    if request.method == 'PATCH':
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify({"error": "invalid request data"}), 400

        guests = load_guests()
        if name not in guests:
            return jsonify({"error": "unknown guest"}), 404

        # Validate fields
        valid_fields = {
            'first_time', 'allergies', 'avoid', 'diet',
            'will_drink', 'experience', 'intensity',
            'likes', 'notes', 'seating', 'assigned_drink'
        }

        for key in data:
            if key not in valid_fields:
                return jsonify({"error": f"invalid field: {key}"}), 400
            guests[name][key] = data[key]

        save_guests(guests)
        get_cached_guest.cache_clear()  # Clear cache after update

    guest_data = get_cached_guest(name)
    if not guest_data:
        return jsonify({"error": "unknown guest"}), 404

    return jsonify(guest_data)


# ─────────────────────────────────────────────────────────────
# 3) Survey Page
# ─────────────────────────────────────────────────────────────
@app.route('/survey/<name>')
def survey(name):
    guests = load_guests()
    if name not in guests:
        flash('Survey session expired or invalid. Please start over.', 'error')
        return redirect(url_for('rsvp'))
        
    # Get current progress
    guest_data = guests[name]
    current_step = guest_data.get('current_step', 1)
    
    # Get taken seats for the seating step
    taken = [g.get('seating') for g in guests.values() if g.get('seating')]
    current = guest_data.get('seating', '')

    return render_template(
        'survey.html',
        name=name,
        taken_seats=taken,
        current_seat=current,
        current_step=current_step,
        total_steps=10,
        guest_data=guest_data,
        completion_status=guest_data.get('completion_status', {}),
        hide_nav=True
    )


# ─────────────────────────────────────────────────────────────
# 4) Home / Index → Guest List
# ─────────────────────────────────────────────────────────────
@app.route('/')
def index():
    settings = load_settings()
    if not settings.get('menu_available', False):
        return redirect(url_for('rsvp'))

    guests = load_guests()
    return render_template('index.html',
                           guests=guests,
                           hide_nav=True)


# ─────────────────────────────────────────────────────────────
# 5) Upload & Draw (Admin + Per-Guest)
# ─────────────────────────────────────────────────────────────
@app.route('/upload', methods=['GET', 'POST'])
def upload():
    guest = request.args.get('guest')
    if request.method == 'POST':
        f = request.files.get('file')
        if not f or not f.filename:
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return jsonify({'error': 'no file uploaded'}), 400
            flash("No file selected.", "error")
            return redirect(request.referrer or url_for('admin'))

        filename  = f"current_{guest}.jpg" if guest else "current.jpg"
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        f.save(save_path)
        ts = os.path.getmtime(save_path)
        socketio.emit('image_updated', {
            'last_modified': ts,
            'guest': guest or None
        })

        if not guest:
            for name in load_guests().keys():
                guest_fn = f"current_{name}.jpg"
                guest_fp = os.path.join(app.config['UPLOAD_FOLDER'], guest_fn)
                shutil.copy(save_path, guest_fp)
                socketio.emit('image_updated', {
                    'last_modified': ts,
                    'guest': name
                })

        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify({'last_modified': ts, 'guest': guest or None})

        flash("Menu uploaded successfully.", "success")
        return redirect(request.referrer or url_for('admin'))

    fn = f"uploads/current_{guest}.jpg" if guest else "uploads/current.jpg"
    full = os.path.join(app.config['UPLOAD_FOLDER'], fn.split('/')[-1])
    menu_image = fn if os.path.exists(full) else None

    return render_template(
        'upload.html',
        menu_image=menu_image,
        draw_for_guest=guest or '',
        now_ts=int(time.time()),
        hide_nav=True
    )


# ─────────────────────────────────────────────────────────────
# 6) Last Modified Time (JSON)
# ─────────────────────────────────────────────────────────────
@app.route('/last_modified')
def last_modified():
    path = os.path.join(UPLOAD_FOLDER, 'current.jpg')
    return jsonify({'last_modified': os.path.getmtime(path)})


# ────────────────────────────────────────────
# 7) Admin Dashboard & Export
# ────────────────────────────────────────────
@app.route('/admin')
def admin():
    guests         = load_guests()
    settings       = load_settings()
    menu_available = settings.get('menu_available', False)
    previews = []

    base_fp = os.path.join(app.config['UPLOAD_FOLDER'], 'current.jpg')
    if os.path.exists(base_fp):
        previews.append({
            'name': 'Base',
            'url': url_for('static', filename='uploads/current.jpg')
        })

    courses = load_courses()
    for name in guests:
        guest_fn = f'current_{name}.jpg'
        guest_fp = os.path.join(app.config['UPLOAD_FOLDER'], guest_fn)
        if os.path.exists(guest_fp):
            previews.append({
                'name': name,
                'url': url_for('static', filename=f'uploads/{guest_fn}')
            })

    completed_surveys = sum(
      1 for g in guests.values()
      if len(g.get('completion_status', {})) >= 5
    )

    courses.sort(key=lambda c: c['order'])
    return render_template(
      'admin.html',
      guests=guests,
      settings=settings,
      menu_available=menu_available,
      previews=previews,
      courses=courses,
      completed_surveys=completed_surveys,
      hide_nav=True
    )

@app.route('/admin/toggle_menu', methods=['POST'])
def toggle_menu():
    settings = load_settings()
    settings['menu_available'] = not settings.get('menu_available', False)
    save_settings(settings)
    return redirect(url_for('admin'))

@app.route('/admin/export')
def admin_export():
    return send_file(
        GUESTS_FILE,
        as_attachment=True,
        download_name='guests.json',
        mimetype='application/json'
    )

@app.route('/admin/clear_guests', methods=['POST'])
def admin_clear_guests():
    save_guests({})
    for path in glob(os.path.join(UPLOAD_FOLDER, 'current_*.jpg')):
        os.remove(path)
    flash("All guests and personal menus have been removed.", "success")
    socketio.emit('image_updated', {'last_modified': None, 'guest': None})
    return redirect(url_for('admin'))

@app.route('/admin/menu_for/<name>/create', methods=['POST'])
def admin_create_menu(name):
    base_fp  = os.path.join(UPLOAD_FOLDER, 'current.jpg')
    guest_fn = f'current_{name}.jpg'
    guest_fp = os.path.join(UPLOAD_FOLDER, guest_fn)
    if not os.path.exists(base_fp):
        flash("No base menu to copy.", "error")
    else:
        shutil.copy(base_fp, guest_fp)
        flash(f"Personal menu created for {name}.", "success")
        ts = os.path.getmtime(guest_fp)
        socketio.emit('image_updated', {'last_modified': ts, 'guest': name})
    return redirect(url_for('admin'))

@app.route('/admin/menu_for/<name>/delete', methods=['POST'])
def admin_delete_menu(name):
    guest_fn = f'current_{name}.jpg'
    guest_fp = os.path.join(UPLOAD_FOLDER, guest_fn)
    if os.path.exists(guest_fp):
        os.remove(guest_fp)
        flash(f"Personal menu deleted for {name}.", "success")
        socketio.emit('image_updated', {'last_modified': None, 'guest': name})
    else:
        flash(f"No personal menu existed for {name}.", "error")
    return redirect(url_for('admin'))

@app.route('/admin/courses', methods=['POST'])
def admin_add_course():
    name  = request.form.get('name','').strip()
    order = request.form.get('order', type=int)
    if not name or order is None:
        flash("Both name & order are required", "error")
        return redirect(url_for('admin'))
    courses = load_courses()
    new_id = max([c['id'] for c in courses], default=0) + 1
    courses.append({'id': new_id, 'name': name, 'order': order})
    save_courses(courses)
    flash(f"Added course “{name}”", "success")
    return redirect(url_for('admin'))

@app.route('/admin/courses/<int:cid>/delete', methods=['POST'])
def admin_delete_course(cid):
    courses = load_courses()
    courses = [c for c in courses if c['id'] != cid]
    save_courses(courses)
    flash("Course removed", "success")
    return redirect(url_for('admin'))

# ────────────────────────────────────────────
# New: Guests Table View
# ────────────────────────────────────────────
@app.route('/admin/guests')
def guest_table():
    guests = load_guests()
    settings = load_settings()
    return render_template(
        'guest_table.html',
        settings=settings,
        guests=guests,
        hide_nav=True
    )

# ─────────────────────────────────────────────────────────────
# → New: Broadcast when rating is saved
# ─────────────────────────────────────────────────────────────
@app.route('/api/rate', methods=['POST'])
def api_rate():
    d = request.get_json()
    ratings = load_ratings()
    ratings.append({
      'guest':     d['guest'],
      'course_id': d['course_id'],
      'score':     d['score'],
      'feedback':  d.get('feedback','')
    })
    save_ratings(ratings)
    # emit to all admins watching /admin/ratings
    socketio.emit('new_rating')
    return jsonify(success=True)


# ─────────────────────────────────────────────────────────────
# → New: show the Ratings Dashboard
# ─────────────────────────────────────────────────────────────
@app.route('/admin/ratings')
def admin_ratings():
    courses = load_courses()
    ratings = load_ratings()
    course_map = {c['id']: c['name'] for c in courses}
    return render_template(
        'admin_ratings.html',
        courses=courses,
        ratings=ratings,
        course_map=course_map
    )

@app.route('/admin/clear_ratings', methods=['POST'])
def admin_clear_ratings():
    save_ratings([])
    flash("All ratings cleared.", "success")
    socketio.emit('new_rating')
    return redirect(url_for('admin_ratings'))


# ────────────────────────────────────────────
# 7a) Drink Options CRUD
# ────────────────────────────────────────────
@app.route('/admin/drinks', methods=['POST'])
def add_drink():
    settings = load_settings()
    new = request.form.get('drink','').strip()
    if new and new not in settings['drink_options']:
        settings['drink_options'].append(new)
        save_settings(settings)
        flash(f'Added drink “{new}”.', 'success')
    else:
        flash('Invalid or duplicate drink.', 'error')
    return redirect(url_for('admin'))

@app.route('/admin/drinks/<drink>/delete', methods=['POST'])
def delete_drink(drink):
    settings = load_settings()
    if drink in settings['drink_options']:
        settings['drink_options'].remove(drink)
        save_settings(settings)
        flash(f'Removed drink “{drink}”.', 'success')
    else:
        flash('Drink not found.', 'error')
    return redirect(url_for('admin'))


# ─────────────────────────────────────────────────────────────
# 8) Menu Lookup & Personalized Menu
# ─────────────────────────────────────────────────────────────
@app.route('/menu', methods=['GET'])
def menu_lookup():
    if not load_settings().get('menu_available', False):
        return render_template('menu_unavailable.html', hide_nav=True)
    guests = load_guests()
    return render_template('menu_lookup.html',
                           guests=guests,
                           hide_nav=True)

@app.route('/menu/<name>')
def view_menu(name):
    settings = load_settings()
    if not settings.get('menu_available', False):
        return render_template('menu_unavailable.html', hide_nav=True)

    guests = load_guests()
    if name not in guests:
        return redirect(url_for('menu_lookup'))

    guest_fn = f"current_{name}.jpg"
    guest_fp = os.path.join(app.config['UPLOAD_FOLDER'], guest_fn)
    if os.path.exists(guest_fp):
        menu_image = f"uploads/{guest_fn}"
    else:
        menu_image = "uploads/current.jpg"

    return render_template('menu.html',
                           name=name,
                           menu_image=menu_image,
                           hide_nav=True,
                           assigned_drink=guests[name].get('assigned_drink')
                           )


# ─────────────────────────────────────────────────────────────
# 9) Rating route for guests (step 2)
# ─────────────────────────────────────────────────────────────
@app.route('/rate/<int:course_id>/<guest>')
def rate_course(course_id, guest):
    guests = load_guests()
    courses = load_courses()
    if guest not in guests:
        abort(404)
    course = next((c for c in courses if c['id'] == course_id), None)
    if not course:
        abort(404)
    return render_template('rate.html',
                           course=course,
                           guest=guest,
                           hide_nav=True)


if __name__ == '__main__':
    socketio.run(app, debug=True, port=5001)