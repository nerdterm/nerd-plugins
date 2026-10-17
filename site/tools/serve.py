# A local server for a built site: threaded, with a deep listen queue so the page's parallel loads are not dropped.
# python3 site/tools/serve.py <port> <built site folder>
import functools, http.server, sys
class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True
port, root = int(sys.argv[1]), sys.argv[2]
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass
    # Every reload gets the current files: no cache.
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
handler = functools.partial(Handler, directory=root)
Server(('127.0.0.1', port), handler).serve_forever()
