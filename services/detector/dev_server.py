import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

from handler import handler

# This is a simple HTTP server that listens for POST requests and forwards them to the handler function.
class DetectorRequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        # validate body
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length)
        event = json.loads(raw_body) if raw_body else {}

        result = handler(event, {})

        body = json.dumps(result).encode("utf-8")

        # handle client response
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


# Run the server if this script is executed directly
if __name__ == "__main__":
    port = int(os.environ.get("DETECTOR_PORT", "8000"))
    HTTPServer(("localhost", port), DetectorRequestHandler).serve_forever()
