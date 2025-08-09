from flask import Flask, request, jsonify, send_from_directory
import sqlite3, os, time

DB = 'scores.db'
app = Flask(__name__, static_folder='.', static_url_path='')

def init_db():
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute('''
      CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        shape TEXT,
        score REAL,
        created_at INTEGER
      );
    ''')
    conn.commit()
    conn.close()

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/submit-score', methods=['POST'])
def submit_score():
    data = request.get_json(force=True)
    name = data.get('name','Anonymous')
    shape = data.get('shape','circle').lower()

    # Validate shape
    allowed_shapes = ['circle', 'rectangle', 'triangle']
    if shape not in allowed_shapes:
        return jsonify(success=False, error='Invalid shape'), 400

    try:
        score = float(data.get('score', 0))
    except ValueError:
        score = 0

    ts = int(time.time())
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute('INSERT INTO scores (name,shape,score,created_at) VALUES (?,?,?,?)', (name, shape, score, ts))
    conn.commit()
    conn.close()
    return jsonify(success=True)

@app.route('/scores', methods=['GET'])
def get_scores():
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    rows = c.execute('SELECT name,shape,score,created_at FROM scores ORDER BY score DESC LIMIT 50').fetchall()
    conn.close()
    out = [ {'name':r[0], 'shape':r[1], 'score':r[2], 'when':r[3]} for r in rows ]
    return jsonify(out)

if __name__ == '__main__':
    init_db()
    app.run(debug=True)
