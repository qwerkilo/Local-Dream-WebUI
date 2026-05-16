import base64
import io
import json

import requests
from flask import Flask, Response, jsonify, render_template, request, stream_with_context
from PIL import Image

app = Flask(__name__)
LOCAL_DREAM_URL = "http://127.0.0.1:8081"


def raw_rgb_to_png_b64(data):
    raw = base64.b64decode(data["image"])
    img = Image.frombytes("RGB", (data["width"], data["height"]), raw)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    try:
        r = requests.get(f"{LOCAL_DREAM_URL}/", timeout=2)
        return jsonify({"ok": True})
    except Exception:
        return jsonify({"ok": False, "error": "Local Dream not reachable"}), 503


@app.route("/generate", methods=["POST"])
def generate():
    payload = request.json

    def stream():
        try:
            with requests.post(
                f"{LOCAL_DREAM_URL}/generate",
                json=payload,
                stream=True,
                timeout=300,
            ) as r:
                event_type = None
                for raw_line in r.iter_lines():
                    if not raw_line:
                        event_type = None
                        continue
                    line = raw_line.decode()
                    if line.startswith("event:"):
                        event_type = line[6:].strip()
                        yield line + "\n"
                    elif line.startswith("data:"):
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            yield "data: [DONE]\n\n"
                            return
                        if event_type == "complete":
                            try:
                                data = json.loads(data_str)
                                data["png_image"] = raw_rgb_to_png_b64(data)
                                del data["image"]
                                yield f"data: {json.dumps(data)}\n\n"
                            except Exception as e:
                                yield f"data: {json.dumps({'type':'error','error':str(e)})}\n\n"
                        else:
                            yield f"data: {data_str}\n\n"
                    else:
                        yield line + "\n"
        except requests.exceptions.ConnectionError:
            yield "data: " + json.dumps({"type": "error", "error": "Cannot connect to Local Dream. Is it running?"}) + "\n\n"
        except Exception as e:
            yield "data: " + json.dumps({"type": "error", "error": str(e)}) + "\n\n"

    return Response(stream_with_context(stream()), mimetype="text/event-stream")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
